"""
tools 共通の処理
------------------------------------------------
・データの置き場所（日別計画表・講師用パスワード・チャイム設定・素材）
・日別計画表（日付・訓練内容・時間・時間割表）の検査と保存
・講師用画面のパスワード確認と、他サイトからの送信（CSRF）の拒否
"""
import hmac
import json
import os
import re
from datetime import date, datetime
from pathlib import Path

from flask import Response, abort, request

BASE_DIR = Path(__file__).resolve().parent


def _data_dir():
    """
    データはアプリのフォルダの「外」（隣）に置く。自動デプロイ（rsync --delete）で消えないようにするため。
      サーバー：/home/appuser/apps/tools-data/
      手元のPC：PycharmProjects/tools-data/
    旧名（nisshi-data）しかない場合は、移行するまでそちらを使う。
    """
    if os.environ.get("TOOLS_DATA_DIR"):
        return Path(os.environ["TOOLS_DATA_DIR"])
    new, old = BASE_DIR.parent / "tools-data", BASE_DIR.parent / "nisshi-data"
    return old if (not new.exists() and old.exists()) else new


DATA_DIR = _data_dir()
PLAN_FILE = DATA_DIR / "plan.json"
PASSWORD_FILE = DATA_DIR / "admin_password"


# ---------------- 日別計画表 ----------------
ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def load_plan():
    try:
        return json.loads(PLAN_FILE.read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        return None


def clean_days(raw):
    """ブラウザから届いたデータを検査し、日付・訓練内容・時間だけを取り出す（講師名などは捨てる）"""
    if not isinstance(raw, list) or not (1 <= len(raw) <= 400):
        raise ValueError("日数が正しくありません")
    days, seen = [], set()
    for d in raw:
        if not isinstance(d, dict):
            raise ValueError("形式が正しくありません")
        iso = str(d.get("iso", ""))
        content = str(d.get("content", "")).strip()
        hours = d.get("hours", 0)
        if not ISO_RE.match(iso):
            raise ValueError(f"日付が正しくありません：{iso}")
        date.fromisoformat(iso)  # 実在しない日付ならここで例外
        if iso in seen:
            raise ValueError(f"日付が重複しています：{iso}")
        if not content or len(content) > 100:
            raise ValueError(f"{iso} の訓練内容が正しくありません")
        if not isinstance(hours, int) or not (0 <= hours <= 8):
            raise ValueError(f"{iso} の時間が正しくありません")
        seen.add(iso)
        days.append({"iso": iso, "content": content, "hours": hours})
    days.sort(key=lambda x: x["iso"])
    return days


def clean_timetable(raw):
    """時間割表（1限目 10:10〜11:00 など）を検査する"""
    if not isinstance(raw, list) or len(raw) > 12:
        return []
    out = []
    for r in raw:
        if not isinstance(r, dict):
            continue
        label, start, end = str(r.get("label", ""))[:10], str(r.get("start", "")), str(r.get("end", ""))
        period = r.get("period", 0)
        if label and TIME_RE.match(start) and TIME_RE.match(end) and start < end and isinstance(period, int) and 0 <= period <= 9:
            out.append({"label": label, "period": period, "start": start, "end": end})
    return sorted(out, key=lambda x: x["start"])


def save_plan(days, timetable):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    old = load_plan() or {}
    if PLAN_FILE.exists():  # 1つ前の登録を残しておく（登録ミスの戻し用）
        PLAN_FILE.replace(DATA_DIR / "plan.prev.json")
    # 時間割表が読み取れなかったときは、前回の時間割表をそのまま使う
    data = {"updated": datetime.now().strftime("%Y-%m-%d %H:%M"), "days": days,
            "timetable": timetable or old.get("timetable", [])}
    tmp = DATA_DIR / "plan.json.tmp"
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(PLAN_FILE)
    return data


def to_page_json(obj):
    """<script type="application/json"> に埋め込むための JSON（</script> 対策で < をエスケープ）"""
    return json.dumps(obj, ensure_ascii=False).replace("<", "\\u003c")


def plan_json_for_page(plan=None):
    return to_page_json(plan or load_plan() or {"updated": None, "days": [], "timetable": []})


# ---------------- 講師用画面の認証 ----------------
def admin_password():
    try:
        return PASSWORD_FILE.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return ""


def require_admin():
    pw = admin_password()
    if not pw:
        abort(Response(
            "講師用画面のパスワードが未設定です。サーバーの "
            f"{PASSWORD_FILE} にパスワードを1行で書いてください（README 参照）。",
            503, mimetype="text/plain"))
    auth = request.authorization
    ok = auth is not None and auth.password is not None and hmac.compare_digest(
        auth.password.encode("utf-8"), pw.encode("utf-8"))
    if not ok:
        abort(Response("講師用のパスワードが必要です。", 401,
                       {"WWW-Authenticate": 'Basic realm="tools-admin", charset="UTF-8"'}))


def require_admin_post():
    """講師用の登録・保存：パスワードに加えて、送信元が同じサイトか確認する（CSRF 対策）"""
    require_admin()
    origin = request.headers.get("Origin")
    if origin is not None and re.sub(r"^https?://", "", origin) != request.host:
        abort(403)


def is_admin_path(path):
    return path.startswith("/admin") or path.startswith("/chime/admin")
