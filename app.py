"""
訓練日誌 下書きツール（nisshi）
------------------------------------------------
・受講者用の画面（/）：
    サーバーに登録済みの日別計画表（日付・訓練内容・時間のみ）をページに埋め込んで配ります。
    名簿の読み込み、出欠・感想の入力、印刷はすべて「ブラウザの中」で行い、
    氏名や感想（個人情報）はサーバーに送信・保存しません。
    （Content-Security-Policy の connect-src 'none' / form-action 'none' で
      ページからの通信そのものを禁止しています）
・講師用の画面（/admin、パスワード付き）：
    日別計画表PDFをブラウザの中（pdf.js）で読み取り、講師名を取り除いた
    「日付・訓練内容・時間」と時間割表だけをサーバーに登録します。PDF そのものは送信しません。
・チャイム表示画面（/chime）：
    教室のPCで全画面表示するチャイム（デスクトップ版 chimeApp.py の Web 版）。
    登録済みの日程と、講師用のチャイム設定（/admin-chime）をページに埋め込んで配ります。
"""
import hmac
import json
import mimetypes
import os
import re
import secrets
import time
from datetime import date, datetime
from pathlib import Path
from urllib.parse import quote

from flask import Flask, Response, abort, redirect, render_template, request, send_from_directory

from chime_store import Store

# pdf.js（static/vendor/pdfjs/*.mjs）を JavaScript として配るための設定。
# 古い Python では .mjs の種類が登録されておらず、ブラウザが読み込みを拒否するため
mimetypes.add_type("text/javascript", ".mjs")

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 32 * 1024 * 1024  # 素材のアップロードを考えて 32MB まで

BASE_DIR = Path(__file__).resolve().parent
# 登録した日別計画表とパスワードの置き場所。
# 自動デプロイ（rsync --delete）で消えないよう、アプリのフォルダの「外」（隣）に置く
#   サーバー：/home/appuser/apps/nisshi-data/
#   手元のPC：PycharmProjects/nisshi-data/
DATA_DIR = Path(os.environ.get("NISSHI_DATA_DIR", BASE_DIR.parent / "nisshi-data"))
PLAN_FILE = DATA_DIR / "plan.json"
PASSWORD_FILE = DATA_DIR / "admin_password"
CHIME = Store(DATA_DIR)

# CSS / JS 更新時にブラウザのキャッシュを確実に切り替えるための番号
ASSET_VERSION = str(int(time.time()))


def csp(form_action):
    return "; ".join([
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' https://fonts.googleapis.com",
        "font-src https://fonts.gstatic.com",
        "img-src 'self' data:",
        "connect-src 'none'",          # fetch / XHR などの通信を一切禁止
        f"form-action {form_action}",  # 受講者用は 'none'、講師用は登録ボタンのみ 'self'
        "frame-ancestors 'none'",
        "base-uri 'none'",
    ])


@app.after_request
def add_security_headers(response):
    is_admin = request.path.startswith("/admin")
    response.headers["Content-Security-Policy"] = csp("'self'" if is_admin else "'none'")
    response.headers["X-Content-Type-Options"] = "nosniff"
    # 講師用は登録時の送信元チェック（Origin）のため same-origin にする
    response.headers["Referrer-Policy"] = "same-origin" if is_admin else "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if is_admin:
        response.headers["Cache-Control"] = "no-store"
    return response


# ---------------- 日別計画表の読み書き ----------------
ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


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


TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


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


def plan_json_for_page(plan):
    """<script type="application/json"> に埋め込むための JSON（</script> 対策で < をエスケープ）"""
    return to_page_json(plan or {"updated": None, "days": [], "timetable": []})


def to_page_json(obj):
    return json.dumps(obj, ensure_ascii=False).replace("<", "\\u003c")


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
                       {"WWW-Authenticate": 'Basic realm="nisshi-admin", charset="UTF-8"'}))


def same_origin_post():
    """他のサイトからの勝手な登録（CSRF）を防ぐため、送信元が同じサイトか確認する"""
    origin = request.headers.get("Origin")
    if origin is None:
        return True  # 古いブラウザなど Origin を送らない場合は Basic 認証のみで判断
    return re.sub(r"^https?://", "", origin) == request.host


# ---------------- 画面 ----------------
@app.route("/")
def index():
    return render_template("index.html", v=ASSET_VERSION, plan_json=plan_json_for_page(load_plan()))


@app.route("/admin", methods=["GET"])
def admin():
    require_admin()
    return render_template("admin.html", v=ASSET_VERSION, plan=load_plan(),
                           plan_json=plan_json_for_page(load_plan()),
                           message=request.args.get("msg", ""))


@app.route("/admin", methods=["POST"])
def admin_save():
    require_admin()
    if not same_origin_post():
        abort(403)
    try:
        days = clean_days(json.loads(request.form.get("days", "")))
        try:
            timetable = clean_timetable(json.loads(request.form.get("timetable", "[]") or "[]"))
        except ValueError:
            timetable = []
    except (ValueError, TypeError) as e:
        return render_template("admin.html", v=ASSET_VERSION, plan=load_plan(),
                               plan_json=plan_json_for_page(load_plan()),
                               message=f"登録できませんでした：{e}"), 400
    data = save_plan(days, timetable)
    total = sum(d["hours"] for d in days)
    msg = f"{data['updated']} に登録しました（{days[0]['iso']}〜{days[-1]['iso']}、合計 {total}H）"
    # 再読み込みで二重登録しないよう、登録後は GET に切り替える
    return redirect("admin?msg=" + quote(msg), code=303)


# ---------------- チャイム（chime） ----------------
@app.route("/chime")
def chime():
    """教室のPCで全画面表示するチャイム画面（パスワードなし。個人情報は含まない）"""
    return render_template("chime.html", v=ASSET_VERSION,
                           plan_json=plan_json_for_page(load_plan()),
                           chime_json=to_page_json(CHIME.load()))


@app.route("/media/<path:name>")
def media(name):
    """アップロードした素材（チャイム音・画像・BGM）"""
    return send_from_directory(CHIME.media_dir, Store.safe_name(name), max_age=3600)


def render_chime_admin(message="", status=200):
    return render_template("admin_chime.html", v=ASSET_VERSION, message=message,
                           plan_json=plan_json_for_page(load_plan()),
                           chime_json=to_page_json(CHIME.load()),
                           media_json=to_page_json(CHIME.list_media()),
                           media=CHIME.list_media(), usage=CHIME.usage()), status


@app.route("/admin-chime", methods=["GET"])
def admin_chime():
    require_admin()
    return render_chime_admin(request.args.get("msg", ""))


@app.route("/admin-chime", methods=["POST"])
def admin_chime_save():
    require_admin()
    if not same_origin_post():
        abort(403)
    try:
        data = CHIME.save(json.loads(request.form.get("chime", "")))
    except (ValueError, TypeError, AttributeError) as e:
        return render_chime_admin(f"保存できませんでした：{e}", 400)
    return redirect("admin-chime?msg=" + quote(f"{data['updated']} に保存しました"), code=303)


@app.route("/admin-chime-upload", methods=["POST"])
def admin_chime_upload():
    require_admin()
    if not same_origin_post():
        abort(403)
    names, errors = [], []
    for f in request.files.getlist("files"):
        if not f or not f.filename:
            continue
        try:
            names.append(CHIME.add_media(f))
        except ValueError as e:
            errors.append(str(e))
    msg = ("アップロードしました：" + "、".join(names) if names else "") + ("　" if names and errors else "") + "　".join(errors)
    return redirect("admin-chime?msg=" + quote(msg or "ファイルが選ばれていません"), code=303)


@app.route("/admin-chime-delete", methods=["POST"])
def admin_chime_delete():
    require_admin()
    if not same_origin_post():
        abort(403)
    name = request.form.get("name", "")
    try:
        CHIME.delete_media(name)
        msg = f"削除しました：{name}"
    except ValueError as e:
        msg = str(e)
    return redirect("admin-chime?msg=" + quote(msg), code=303)


@app.errorhandler(413)
def too_large(_e):
    return Response("ファイルが大きすぎます（1回のアップロードは32MBまで）。ブラウザの「戻る」で戻ってください。",
                    413, mimetype="text/plain")


@app.route("/healthz")
def healthz():
    """デプロイ後の動作確認用"""
    return "ok"


if __name__ == "__main__":
    # PyCharm から実行したとき（開発用）
    # 初回はパスワード未設定なので、開発用に自動で作る（サーバーでは手作業で作成）
    if not PASSWORD_FILE.exists():
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        PASSWORD_FILE.write_text(secrets.token_urlsafe(9), encoding="utf-8")
    print(f"講師用画面：http://127.0.0.1:5012/admin  （パスワードは {PASSWORD_FILE} の中身）")
    app.run(host="127.0.0.1", port=5012, debug=True)
