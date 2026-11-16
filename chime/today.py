"""
「今日は何の日？」… 日本語版 Wikipedia の日付ページ（例：「11月16日」）から
  ・記念日・年中行事
  ・できごと のうち IT・コンピュータに関係するもの
を取り出して、DATA_DIR/today/MMDD.json に保存します。

・取得はサーバーから行います（チャイム表示画面は通信を禁止しているため、ページに埋め込んで配る）
・1度取得した日は保存したものを使い、30日たったら取り直します。取得に失敗したときは前回の内容を使います
・Wikipedia の文章は CC BY-SA ライセンスです。画面には出典（Wikipedia「11月16日」）を表示します
"""
import json
import re
import threading
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

USER_AGENT = "tools-chime/1.0 (https://github.com/telcation/tools)"  # Wikimedia の決まりで名乗りが必要
REFRESH_DAYS = 30
MAX_ANNIV = 6
MAX_IT = 3

# IT・コンピュータ関連のできごとを選ぶための語句（英字の短い語は前後が英字でないときだけ一致）
IT_WORDS = [
    "コンピュータ", "コンピューター", "計算機", "パソコン", "インターネット", "ウェブ", "World Wide Web",
    "ソフトウェア", "プログラミング", "プログラム言語", "オペレーティングシステム", "半導体", "トランジスタ",
    "集積回路", "マイクロプロセッサ", "電子メール", "携帯電話", "スマートフォン", "ゲーム機", "ファミリーコンピュータ",
    "プレイステーション", "PlayStation", "任天堂", "マイクロソフト", "Microsoft", "Windows", "アップル", "Apple",
    "Macintosh", "iPhone", "iPad", "Android", "Google", "グーグル", "Amazon", "Facebook", "Twitter", "YouTube",
    "ウィキペディア", "Wikipedia", "Linux", "UNIX", "Unix", "IBM", "インテル", "Intel", "富士通", "日本電気",
    "ENIAC", "人工知能", "ロボット", "ブラウザ", "Java", "Python", "C言語", "COBOL", "FORTRAN", "暗号",
    "コンピュータウイルス", "ハッカー", "Wi-Fi", "Bluetooth", "USB", "デジタル", "データベース", "検索エンジン",
]
IT_SHORT = ["AI", "OS", "PC", "Mac", "CPU", "LAN"]
IT_RE = re.compile("|".join(re.escape(w) for w in IT_WORDS) + "|" +
                   "|".join(rf"(?<![A-Za-z]){re.escape(w)}(?![A-Za-z])" for w in IT_SHORT))


# ---------------- Wiki 記法を普通の文章にする ----------------
def _template(m):
    body = m.group(1)
    parts = body.split("|")
    name = parts[0].strip()
    if name in ("仮リンク", "Ill", "ill") and len(parts) > 1:
        return parts[1]
    if name in ("lang", "Lang") and len(parts) > 2:
        return parts[2]
    if name in ("要出典", "要出典範囲", "要検証", "Efn", "efn", "Refnest", "refnest", "Sfn", "sfn"):
        return parts[1] if name.startswith("要出典範囲") and len(parts) > 1 else ""
    return ""  # 国旗（{{JPN}} など）やその他のテンプレートは消す


def plain(text):
    s = text
    s = re.sub(r"<ref[^>/]*/>", "", s)
    s = re.sub(r"<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    for _ in range(3):  # 入れ子のテンプレートを内側から
        s = re.sub(r"\{\{([^{}]*)\}\}", _template, s)
    s = re.sub(r"\[\[(?:ファイル|File|画像|Image):[^\]]*\]\]", "", s)
    s = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\[\[([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\[https?://\S+\s+([^\]]*)\]", r"\1", s)
    s = re.sub(r"'{2,}", "", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


# ---------------- ページの解析 ----------------
def sections(wikitext):
    """見出し（== 名前 ==）ごとに本文を分ける。サブ見出し（=== ===）はまとめて親に含める"""
    out, cur = {}, None
    for line in wikitext.splitlines():
        m = re.match(r"^==\s*([^=].*?)\s*==\s*$", line)
        if m:
            cur = m.group(1).strip()
            out.setdefault(cur, [])
            continue
        if cur:
            out[cur].append(line)
    return out


def _find(secs, *names):
    for n in names:
        for k, v in secs.items():
            if k.replace(" ", "") == n:
                return v
    return []


def parse(wikitext):
    secs = sections(wikitext)

    # 記念日・年中行事：「* [[幼稚園記念日]]（{{JPN}}）」の形。日本のものを先に
    anniv = []
    for line in _find(secs, "記念日・年中行事", "記念日・行事", "記念日"):
        if not re.match(r"^\*(?![*:])", line):
            continue  # 「*:」は説明文、「**」は細目なので使わない
        japan = "{{JPN}}" in line or "{{日本}}" in line or "日本" in line
        name = plain(re.sub(r"^\*\s*", "", line))
        name = re.sub(r"[（(]\s*[）)]", "", name).strip()  # 国旗を消したあとの空の括弧
        if name and len(name) <= 60:
            anniv.append((0 if japan else 1, name))
    anniv = [n for _, n in sorted(anniv, key=lambda x: x[0])]

    # できごと：「* [[1981年]] - 本文」の形から IT・コンピュータ関連だけ
    it = []
    for line in _find(secs, "できごと", "出来事"):
        m = re.match(r"^\*(?![*:])\s*(.+?)\s*[-‐－—–]\s*(.+)$", line)
        if not m:
            continue
        ym = re.search(r"(紀元前)?(\d{1,4})年", m.group(1))
        body = plain(m.group(2))
        if ym and body and IT_RE.search(body):
            year = int(ym.group(2)) * (-1 if ym.group(1) else 1)
            it.append({"year": year, "text": body[:120]})
    it.sort(key=lambda x: x["year"])
    return {"anniversaries": anniv[:MAX_ANNIV], "it_events": it[-MAX_IT:] if len(it) > MAX_IT else it}


# ---------------- 取得と保存 ----------------
def page_title(d):
    return f"{d.month}月{d.day}日"


def fetch(d, timeout=6):
    title = page_title(d)
    url = "https://ja.wikipedia.org/w/index.php?" + urllib.parse.urlencode({"title": title, "action": "raw"})
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        text = r.read().decode("utf-8")
    data = parse(text)
    data.update({"title": title, "source": f"https://ja.wikipedia.org/wiki/{urllib.parse.quote(title)}",
                 "fetched": datetime.now().strftime("%Y-%m-%d %H:%M"), "error": ""})
    return data


class Today:
    def __init__(self, data_dir: Path):
        self.dir = Path(data_dir) / "today"
        self._lock = threading.Lock()
        self._failed = {}  # 日付 → 取得に失敗した時刻（失敗が続くときに毎回待たされないよう、1時間は取り直さない）

    def _file(self, d):
        return self.dir / f"{d.month:02d}{d.day:02d}.json"

    def cached(self, d):
        try:
            return json.loads(self._file(d).read_text(encoding="utf-8"))
        except (FileNotFoundError, ValueError):
            return None

    def refresh(self, d):
        """取り直す。失敗したら前回の内容に error を付けて返す"""
        with self._lock:
            old = self.cached(d)
            try:
                data = fetch(d)
            except Exception as e:  # 通信できない・ページの形が変わった など
                self._failed[d] = datetime.now()
                data = dict(old or {"title": page_title(d), "anniversaries": [], "it_events": [],
                                    "source": "", "fetched": ""})
                data["error"] = f"{type(e).__name__}: {e}"[:200]
                return data
            self._failed.pop(d, None)
            self.dir.mkdir(parents=True, exist_ok=True)
            tmp = self._file(d).with_suffix(".tmp")
            tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
            tmp.replace(self._file(d))
            return data

    def get(self, d=None):
        """表示用：保存済みがあればそれを使い、無いか古ければ取り直す。翌日以降の分は裏で先に取っておく"""
        d = d or date.today()
        data = self.cached(d)
        stale = True
        if data and data.get("fetched"):
            try:
                stale = datetime.now() - datetime.strptime(data["fetched"], "%Y-%m-%d %H:%M") > timedelta(days=REFRESH_DAYS)
            except ValueError:
                stale = True
        recently_failed = d in self._failed and datetime.now() - self._failed[d] < timedelta(hours=1)
        if (data is None or stale) and not recently_failed:
            data = self.refresh(d)
        elif data is None:
            data = {"title": page_title(d), "anniversaries": [], "it_events": [], "source": "", "fetched": "",
                    "error": "Wikipedia に接続できませんでした（1時間後にもう一度取得します）"}
        threading.Thread(target=self._prefetch, args=(d,), daemon=True).start()
        return data

    def _prefetch(self, d):
        for i in (1, 2, 3):
            nd = d + timedelta(days=i)
            if self.cached(nd) is None and nd not in self._failed:
                self.refresh(nd)
