"""
tools（授業用ツール集）
------------------------------------------------
1つの Flask アプリで、次のツールをまとめて配信します（nginx から /tools/ で公開）。

  /tools/              トップページ（ツールの一覧）
  /tools/admin         日別計画表の登録（講師用・パスワード付き）… 各ツールで共通に使う日程
  /tools/nisshi/       訓練日誌 下書きツール（nisshi/ フォルダ）
  /tools/chime/        チャイム表示画面（chime/ フォルダ）
  /tools/chime/admin   チャイムの設定（講師用・パスワード付き）
  /tools/namepicker/   名前ピッカー（namepicker/ フォルダ）

個人情報の扱い
  ・日別計画表PDFはブラウザの中（pdf.js）で読み取り、講師名を除いた「日付・訓練内容・時間」と
    時間割表だけを登録します。PDF そのものは送信しません。
  ・訓練日誌の氏名・感想、名前ピッカーの名簿はブラウザの中だけで扱い、サーバーに送信・保存しません。
    （受講者用・チャイム表示・名前ピッカーの画面は Content-Security-Policy で通信を禁止しています）
"""
import json
import mimetypes
import secrets
import time

from flask import Flask, Response, redirect, render_template, request, url_for
from werkzeug.middleware.proxy_fix import ProxyFix

import core
from chime import bp as chime_bp
from namepicker import bp as namepicker_bp
from nisshi import bp as nisshi_bp

# pdf.js（static/vendor/pdfjs/*.mjs）を JavaScript として配るための設定。
# 古い Python では .mjs の種類が登録されておらず、ブラウザが読み込みを拒否するため
mimetypes.add_type("text/javascript", ".mjs")

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 32 * 1024 * 1024  # チャイムの素材のアップロードを考えて 32MB まで
# nginx が付ける X-Forwarded-Prefix: /tools を読み取り、url_for() が /tools/... のURLを作るようにする
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

# CSS / JS 更新時にブラウザのキャッシュを確実に切り替えるための番号
app.jinja_env.globals["v"] = str(int(time.time()))

app.register_blueprint(nisshi_bp, url_prefix="/nisshi")
app.register_blueprint(chime_bp, url_prefix="/chime")
app.register_blueprint(namepicker_bp, url_prefix="/namepicker")


def csp(form_action):
    return "; ".join([
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' https://fonts.googleapis.com",
        "font-src https://fonts.gstatic.com",
        "img-src 'self' data:",
        "connect-src 'none'",          # fetch / XHR などの通信を一切禁止
        f"form-action {form_action}",  # 受講者用・チャイム表示は 'none'、講師用は登録ボタンのみ 'self'
        "frame-ancestors 'none'",
        "base-uri 'none'",
    ])


@app.after_request
def add_security_headers(response):
    is_admin = core.is_admin_path(request.path)
    response.headers["Content-Security-Policy"] = csp("'self'" if is_admin else "'none'")
    response.headers["X-Content-Type-Options"] = "nosniff"
    # 講師用は送信元チェック（Origin）のため same-origin にする
    response.headers["Referrer-Policy"] = "same-origin" if is_admin else "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if is_admin:
        response.headers["Cache-Control"] = "no-store"
    return response


# ---------------- トップページ ----------------
@app.route("/")
def index():
    plan = core.load_plan()
    return render_template("index.html", plan=plan)


# ---------------- 日別計画表の登録（講師用・共通） ----------------
def render_admin(message="", status=200):
    plan = core.load_plan()
    return render_template("admin.html", plan=plan, plan_json=core.plan_json_for_page(plan),
                           message=message), status


@app.route("/admin", methods=["GET"])
def admin():
    core.require_admin()
    return render_admin(request.args.get("msg", ""))


@app.route("/admin", methods=["POST"])
def admin_save():
    core.require_admin_post()
    try:
        days = core.clean_days(json.loads(request.form.get("days", "")))
        try:
            timetable = core.clean_timetable(json.loads(request.form.get("timetable", "[]") or "[]"))
        except ValueError:
            timetable = []
    except (ValueError, TypeError) as e:
        return render_admin(f"登録できませんでした：{e}", 400)
    data = core.save_plan(days, timetable)
    total = sum(d["hours"] for d in days)
    msg = f"{data['updated']} に登録しました（{days[0]['iso']}〜{days[-1]['iso']}、合計 {total}H）"
    # 再読み込みで二重登録しないよう、登録後は GET に切り替える
    return redirect(url_for("admin", msg=msg), code=303)


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
    if not core.PASSWORD_FILE.exists():
        core.DATA_DIR.mkdir(parents=True, exist_ok=True)
        core.PASSWORD_FILE.write_text(secrets.token_urlsafe(9), encoding="utf-8")
    print("トップページ：http://127.0.0.1:5012/")
    print(f"講師用画面のパスワード：{core.PASSWORD_FILE} の中身")
    app.run(host="127.0.0.1", port=5012, debug=True)
