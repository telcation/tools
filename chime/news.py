"""
Java・Python 関連のニュース（休憩中の画面に表示）
------------------------------------------------
・設定した RSS / Atom フィードをサーバーが取得し、タイトルに Java・Python 関連の語句を含む記事だけを選びます
・DATA_DIR/news.json に保存し、3時間たったら取り直します。取得に失敗したときは前回の内容を使います
・チャイム表示画面は通信を禁止しているため、ページに埋め込んで配ります（日付が変わると読み込み直す）
"""
import hashlib
import json
import re
import threading
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

USER_AGENT = "tools-chime/1.0 (https://github.com/telcation/tools)"
REFRESH_HOURS = 3
KEEP = 20  # 保存しておく件数（表示はこのうち設定の件数）

DEFAULT_FEEDS = [
    # Google ニュース（日本語）の検索結果
    "https://news.google.com/rss/search?q=(Java+OR+Python)+(%E3%83%97%E3%83%AD%E3%82%B0%E3%83%A9%E3%83%9F%E3%83%B3%E3%82%B0+OR+%E9%96%8B%E7%99%BA+OR+%E3%82%A8%E3%83%B3%E3%82%B8%E3%83%8B%E3%82%A2)&hl=ja&gl=JP&ceid=JP:ja",
    "https://www.publickey1.jp/atom.xml",              # Publickey
    "https://rss.itmedia.co.jp/rss/2.0/ait.xml",       # ＠IT
]
DEFAULT_WORDS = ["Java", "Python", "JDK", "OpenJDK", "Jakarta EE", "Spring Boot", "Spring Framework",
                 "Django", "Flask", "FastAPI", "PyCharm", "IntelliJ", "pip", "NumPy", "pandas", "Jupyter"]
# これを含む記事は選ばない（「ジャワ島（Java）のコーヒー」などの誤り防止）
DEFAULT_EXCLUDE = ["ジャワ", "コーヒー", "珈琲", "ニシキヘビ", "パイソン（ヘビ）"]

ATOM = "{http://www.w3.org/2005/Atom}"


def _words_re(words):
    parts = []
    for w in words:
        w = w.strip()
        if not w:
            continue
        # 英字の語は前後が英字でないときだけ一致（「JavaScript」を Java と数えない）
        if re.fullmatch(r"[A-Za-z][A-Za-z0-9 .+#-]*", w):
            parts.append(rf"(?<![A-Za-z]){re.escape(w)}(?![A-Za-z])")
        else:
            parts.append(re.escape(w))
    return re.compile("|".join(parts), re.I) if parts else None


def _date(s):
    if not s:
        return None
    s = s.strip()
    try:
        d = parsedate_to_datetime(s)  # RSS（例：Tue, 17 Nov 2026 01:23:45 GMT）
    except (TypeError, ValueError):
        try:
            d = datetime.fromisoformat(s.replace("Z", "+00:00"))  # Atom（例：2026-11-17T01:23:45Z）
        except ValueError:
            return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d


def _clean(s):
    s = re.sub(r"<[^>]+>", "", s or "")
    return re.sub(r"\s+", " ", s).strip()


def parse_feed(xml_bytes, feed_url=""):
    """RSS 2.0 / Atom を読み、[{title, source, date(ISO), link}] を返す"""
    root = ET.fromstring(xml_bytes)
    items = []
    if root.tag.endswith("rss") or root.find("channel") is not None:
        ch = root.find("channel")
        site = _clean(ch.findtext("title")) if ch is not None else ""
        for it in (ch.findall("item") if ch is not None else []):
            title = _clean(it.findtext("title"))
            src = _clean(it.findtext("source")) or site
            # Google ニュースのタイトルは「見出し - 媒体名」の形
            m = re.match(r"^(.*)\s+-\s+([^-]{1,40})$", title)
            if m and "news.google." in feed_url:
                title, src = m.group(1).strip(), m.group(2).strip()
            items.append({"title": title, "source": src, "date": _date(it.findtext("pubDate")),
                          "link": (it.findtext("link") or "").strip()})
    elif root.tag == ATOM + "feed":
        site = _clean(root.findtext(ATOM + "title"))
        for e in root.findall(ATOM + "entry"):
            link = e.find(ATOM + "link")
            items.append({"title": _clean(e.findtext(ATOM + "title")), "source": site,
                          "date": _date(e.findtext(ATOM + "updated") or e.findtext(ATOM + "published")),
                          "link": link.get("href", "") if link is not None else ""})
    return [i for i in items if i["title"]]


def select(items, words, exclude=(), limit=KEEP):
    rx = _words_re(words)
    ng = [w.strip() for w in exclude if w.strip()]
    seen, out = set(), []
    for i in items:
        key = re.sub(r"\W", "", i["title"]).lower()
        if key in seen or (rx and not rx.search(i["title"])) or any(w in i["title"] for w in ng):
            continue
        seen.add(key)
        out.append(i)
    out.sort(key=lambda i: i["date"] or datetime(1970, 1, 1, tzinfo=timezone.utc), reverse=True)
    return [{"title": i["title"][:140], "source": i["source"][:40],
             "date": i["date"].astimezone().strftime("%Y-%m-%d") if i["date"] else "",
             "link": i["link"]} for i in out[:limit]]


def fetch(feeds, words, exclude=(), timeout=6):
    items, errors = [], []
    for url in feeds:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                items += parse_feed(r.read(), url)
        except Exception as e:  # 1つのフィードが失敗しても、ほかは使う
            errors.append(f"{url[:60]}：{type(e).__name__}")
    return select(items, words, exclude), errors


class News:
    def __init__(self, data_dir: Path):
        self.file = Path(data_dir) / "news.json"
        self._lock = threading.Lock()
        self._failed_at = None

    @staticmethod
    def _key(feeds, words, exclude):
        return hashlib.sha1(json.dumps([feeds, words, exclude], ensure_ascii=False).encode()).hexdigest()[:12]

    def cached(self):
        try:
            return json.loads(self.file.read_text(encoding="utf-8"))
        except (FileNotFoundError, ValueError):
            return None

    def refresh(self, feeds, words, exclude=()):
        with self._lock:
            old = self.cached()
            items, errors = fetch(feeds, words, exclude)
            if not items and errors and len(errors) == len(feeds):
                self._failed_at = datetime.now()  # すべて失敗：前回の内容を使い、1時間は取り直さない
                data = dict(old or {"items": [], "fetched": ""})
                data["errors"] = errors
                return data
            self._failed_at = None
            data = {"items": items, "fetched": datetime.now().strftime("%Y-%m-%d %H:%M"),
                    "errors": errors, "key": self._key(feeds, words, list(exclude))}
            self.file.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.file.with_suffix(".tmp")
            tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
            tmp.replace(self.file)
            return data

    def get(self, feeds, words, exclude=()):
        """表示用：保存済みが新しければそれを使い、古いか設定が変わっていれば取り直す"""
        data = self.cached()
        stale = True
        if data and data.get("fetched") and data.get("key") == self._key(feeds, words, list(exclude)):
            try:
                stale = datetime.now() - datetime.strptime(data["fetched"], "%Y-%m-%d %H:%M") > timedelta(hours=REFRESH_HOURS)
            except ValueError:
                stale = True
        recently_failed = self._failed_at and datetime.now() - self._failed_at < timedelta(hours=1)
        if stale and not recently_failed:
            data = self.refresh(feeds, words, exclude)
        if data is None:
            data = {"items": [], "fetched": "", "errors": ["ニュースを取得できませんでした（1時間後にもう一度取得します）"]}
        return data
