"""
チャイム（chime）の設定と素材（音・画像）の保存
------------------------------------------------
・設定：DATA_DIR/chime.json（1つ前の保存は chime.prev.json）
・素材：DATA_DIR/media/ にアップロードされたファイル
どちらもアプリのフォルダの外（nisshi-data）なので、自動デプロイで消えません。

元のデスクトップ版 chimeApp.py との対応
  スケジュールファイル（HH:MM 画像 表示文字 色 大きさ フォント BGM） → schedule
  日程Excel「テキスト」「ツール」                                   → subjects（科目ごと）＋ days（日ごとの上書き）
  表示設定.txt（手動切替の項目）                                     → displays
  config.txt（背景色・準備中画面の文字など）                         → style
  chime.wav / 準備中.png / 準備中.mp3                                → chime_sound / standby_image / standby_bgm
"""
import json
import re
from datetime import date, datetime
from pathlib import Path

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
AUDIO_EXT = {".mp3", ".wav", ".ogg", ".m4a"}
MAX_MEDIA_FILE = 30 * 1024 * 1024    # 1ファイル 30MB まで
MAX_MEDIA_TOTAL = 300 * 1024 * 1024  # 合計 300MB まで

DEFAULT_STYLE = {
    "bgcolor": "#000000",
    "clock_color": "#000000",   # 日付・時刻の文字色
    "font": "BIZ UDPGothic",
    "img_fit": "width",         # width＝横幅に合わせる / cover＝画面全体を覆う / contain＝画像全体を表示
    "img_keep_ratio": True,
    "img_width": None,     # 空欄＝画面に合わせる
    "img_height": None,
    "text_size": 60, "tool_size": 60,
    "text_color": "#ffffff", "tool_color": "#ffffff",
    "text_bg": "#2c3e50", "tool_bg": "#c0392b",
    "text_y": 300, "tool_y": 300,
    "today_enabled": True,      # 準備中画面に「今日は何の日？」を表示する
    "today_size": 34,           # 文字の大きさ（px）
    "today_top": 55,            # 表示位置（画面の上端から％）
}

DEFAULT_CHIME = {
    "updated": None,
    "chime_sound": "",        # 空欄＝標準の電子音
    "standby_image": "",
    "standby_bgm": "",
    "training_days_only": True,
    "style": DEFAULT_STYLE,
    "schedule": [],           # 空のときは時間割表から自動で作る（表示画面・編集画面とも）
    "subjects": {},
    "days": {},
    "displays": [],
}

COLOR_RE = re.compile(r"^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{1,20})$")
FONT_RE = re.compile(r"^[^;{}<>\"'\\]{0,60}$")
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class Store:
    def __init__(self, data_dir: Path):
        self.data_dir = Path(data_dir)
        self.file = self.data_dir / "chime.json"
        self.media_dir = self.data_dir / "media"

    # ---------------- 設定 ----------------
    def load(self):
        try:
            data = json.loads(self.file.read_text(encoding="utf-8"))
        except (FileNotFoundError, ValueError):
            data = {}
        out = json.loads(json.dumps(DEFAULT_CHIME))
        out.update({k: v for k, v in data.items() if k in DEFAULT_CHIME})
        out["style"] = {**DEFAULT_STYLE, **(data.get("style") or {})}
        return out

    def save(self, raw):
        data = self.clean(raw)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        if self.file.exists():
            self.file.replace(self.data_dir / "chime.prev.json")
        data["updated"] = datetime.now().strftime("%Y-%m-%d %H:%M")
        tmp = self.data_dir / "chime.json.tmp"
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        tmp.replace(self.file)
        return data

    # ---------------- 検査 ----------------
    def clean(self, raw):
        if not isinstance(raw, dict):
            raise ValueError("形式が正しくありません")
        media = {m["name"] for m in self.list_media()}

        def text(v, n, what):
            s = str(v or "").strip()
            if len(s) > n:
                raise ValueError(f"{what}が長すぎます（{n}文字まで）")
            return s

        def color(v, what):
            s = str(v or "").strip()
            if s and not COLOR_RE.match(s):
                raise ValueError(f"{what}の色が正しくありません：{s}")
            return s

        def num(v, lo, hi, what, allow_none=False):
            if allow_none and (v is None or v == ""):
                return None
            try:
                n = int(v)
            except (TypeError, ValueError):
                raise ValueError(f"{what}は数字で入力してください")
            if not (lo <= n <= hi):
                raise ValueError(f"{what}は {lo}〜{hi} の範囲で入力してください")
            return n

        def file(v, kinds, what):
            s = str(v or "").strip()
            if not s:
                return ""
            if s not in media:
                raise ValueError(f"{what}の素材「{s}」が見つかりません")
            if Path(s).suffix.lower() not in kinds:
                raise ValueError(f"{what}に「{s}」は使えません")
            return s

        st = raw.get("style") or {}
        font = str(st.get("font", DEFAULT_STYLE["font"])).strip()
        if not FONT_RE.match(font):
            raise ValueError("フォント名に使えない文字があります")
        style = {
            "bgcolor": color(st.get("bgcolor"), "背景") or DEFAULT_STYLE["bgcolor"],
            "clock_color": color(st.get("clock_color"), "日付・時刻") or DEFAULT_STYLE["clock_color"],
            "img_fit": st.get("img_fit") if st.get("img_fit") in ("width", "cover", "contain") else "width",
            "font": font or DEFAULT_STYLE["font"],
            "img_keep_ratio": bool(st.get("img_keep_ratio", True)),
            "img_width": num(st.get("img_width"), 1, 10000, "画像の横幅", True),
            "img_height": num(st.get("img_height"), 1, 10000, "画像の高さ", True),
            "text_size": num(st.get("text_size", 60), 8, 300, "テキストの文字の大きさ"),
            "tool_size": num(st.get("tool_size", 60), 8, 300, "ツールの文字の大きさ"),
            "text_color": color(st.get("text_color"), "テキストの文字") or "#ffffff",
            "tool_color": color(st.get("tool_color"), "ツールの文字") or "#ffffff",
            "text_bg": color(st.get("text_bg"), "テキストの背景"),
            "tool_bg": color(st.get("tool_bg"), "ツールの背景"),
            "text_y": num(st.get("text_y", 300), 0, 5000, "テキストの位置"),
            "tool_y": num(st.get("tool_y", 300), 0, 5000, "ツールの位置"),
            "today_enabled": bool(st.get("today_enabled", True)),
            "today_size": num(st.get("today_size", 34), 10, 120, "「今日は何の日？」の文字の大きさ"),
            "today_top": num(st.get("today_top", 55), 10, 90, "「今日は何の日？」の位置"),
        }

        sched = raw.get("schedule") or []
        if not isinstance(sched, list) or len(sched) > 80:
            raise ValueError("チャイム時刻は80件までです")
        schedule, times = [], set()
        for e in sched:
            t = str(e.get("time", "")).strip()
            if not TIME_RE.match(t):
                raise ValueError(f"時刻が正しくありません：{t or '（空欄）'}")
            if t in times:
                raise ValueError(f"時刻 {t} が重複しています")
            times.add(t)
            schedule.append({
                "time": t,
                "chime": bool(e.get("chime", True)),
                "text": text(e.get("text"), 60, f"{t} の表示文字"),
                "color": color(e.get("color"), f"{t} の文字") or "#ffffff",
                "size": num(e.get("size", 80), 8, 300, f"{t} の文字の大きさ"),
                "image": file(e.get("image"), IMAGE_EXT, f"{t} の画像"),
                "bgm": file(e.get("bgm"), AUDIO_EXT, f"{t} のBGM"),
            })
        schedule.sort(key=lambda x: x["time"])

        subj = raw.get("subjects") or {}
        if not isinstance(subj, dict) or len(subj) > 300:
            raise ValueError("科目の数が多すぎます")
        subjects = {}
        for k, v in subj.items():
            k = text(k, 100, "科目名")
            tx, tl = text((v or {}).get("text"), 80, f"{k} のテキスト"), text((v or {}).get("tool"), 80, f"{k} のツール")
            if k and (tx or tl):
                subjects[k] = {"text": tx, "tool": tl}

        dd = raw.get("days") or {}
        if not isinstance(dd, dict) or len(dd) > 500:
            raise ValueError("日ごとの設定が多すぎます")
        days = {}
        for k, v in dd.items():
            if not ISO_RE.match(str(k)):
                raise ValueError(f"日付が正しくありません：{k}")
            date.fromisoformat(k)
            tx, tl = text((v or {}).get("text"), 80, f"{k} のテキスト"), text((v or {}).get("tool"), 80, f"{k} のツール")
            if tx or tl:
                days[k] = {"text": tx, "tool": tl}

        disp = raw.get("displays") or []
        if not isinstance(disp, list) or len(disp) > 50:
            raise ValueError("手動切替の項目は50件までです")
        displays = []
        for i, e in enumerate(disp, 1):
            label = text(e.get("label"), 40, f"手動切替 {i} 行目の名前")
            if not label:
                raise ValueError(f"手動切替 {i} 行目の名前を入力してください")
            displays.append({
                "label": label,
                "text": text(e.get("text"), 60, f"{label} の表示文字"),
                "color": color(e.get("color"), f"{label} の文字") or "#ffffff",
                "size": num(e.get("size", 80), 8, 300, f"{label} の文字の大きさ"),
                "image": file(e.get("image"), IMAGE_EXT, f"{label} の画像"),
            })

        return {
            "chime_sound": file(raw.get("chime_sound"), AUDIO_EXT, "チャイム音"),
            "standby_image": file(raw.get("standby_image"), IMAGE_EXT, "準備中画面の画像"),
            "standby_bgm": file(raw.get("standby_bgm"), AUDIO_EXT, "準備中画面のBGM"),
            "training_days_only": bool(raw.get("training_days_only", True)),
            "style": style, "schedule": schedule, "subjects": subjects,
            "days": days, "displays": displays,
        }

    # ---------------- 素材 ----------------
    def list_media(self):
        if not self.media_dir.exists():
            return []
        out = []
        for p in sorted(self.media_dir.iterdir(), key=lambda x: x.name):
            ext = p.suffix.lower()
            if p.is_file() and ext in IMAGE_EXT | AUDIO_EXT:
                out.append({"name": p.name, "kind": "image" if ext in IMAGE_EXT else "audio",
                            "size": p.stat().st_size})
        return out

    @staticmethod
    def safe_name(name):
        name = Path(str(name).replace("\\", "/")).name  # フォルダ部分は捨てる
        name = re.sub(r"[^\w.\-()（）]", "_", name).lstrip(".")
        return name[:80]

    def add_media(self, storage):
        name = self.safe_name(storage.filename or "")
        ext = Path(name).suffix.lower()
        if not name or ext not in IMAGE_EXT | AUDIO_EXT:
            raise ValueError(f"「{storage.filename}」は使えません（画像：png/jpg/gif/webp、音声：mp3/wav/ogg/m4a）")
        self.media_dir.mkdir(parents=True, exist_ok=True)
        tmp = self.media_dir / (name + ".uploading")
        storage.save(tmp)
        size = tmp.stat().st_size
        total = sum(m["size"] for m in self.list_media() if m["name"] != name) + size
        if size > MAX_MEDIA_FILE or total > MAX_MEDIA_TOTAL:
            tmp.unlink()
            raise ValueError(f"「{name}」が大きすぎます（1ファイル30MB・合計300MBまで）")
        tmp.replace(self.media_dir / name)  # 同じ名前なら差し替え
        return name

    def delete_media(self, name):
        name = self.safe_name(name)
        used = self.usage().get(name)
        if used:
            raise ValueError(f"「{name}」は {used} で使われているため削除できません。先に設定から外して保存してください。")
        p = self.media_dir / name
        if p.is_file():
            p.unlink()

    def usage(self):
        """素材名 → 使っている場所（削除前の確認用）"""
        c = self.load()
        use = {}

        def mark(n, where):
            if n:
                use.setdefault(n, where)
        mark(c["chime_sound"], "チャイム音")
        mark(c["standby_image"], "準備中画面の画像")
        mark(c["standby_bgm"], "準備中画面のBGM")
        for e in c["schedule"]:
            mark(e.get("image"), f"{e['time']} の画像")
            mark(e.get("bgm"), f"{e['time']} のBGM")
        for e in c["displays"]:
            mark(e.get("image"), f"手動切替「{e['label']}」")
        return use
