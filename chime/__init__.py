"""
チャイム（/tools/chime/）… デスクトップ版 chimeApp.py の Web 版
------------------------------------------------
  /tools/chime/              教室のPCで全画面表示するチャイム画面（パスワードなし。個人情報は含まない）
  /tools/chime/media/<名前>  アップロードした素材（チャイム音・画像・BGM）
  /tools/chime/admin         チャイムの設定（講師用・パスワード付き）
"""
import json
from datetime import date

from flask import Blueprint, Response, redirect, render_template, request, send_from_directory, url_for

import core
from .store import Store
from .news import News
from .today import Today

bp = Blueprint("chime", __name__, template_folder="templates",
               static_folder="static", static_url_path="/static")
STORE = Store(core.DATA_DIR)
TODAY = Today(core.DATA_DIR)
NEWS = News(core.DATA_DIR)


def today_data():
    """「今日は何の日？」（表示しない設定のときは取りに行かない）"""
    if STORE.load()["style"].get("today_enabled", True) is False:
        return None
    return TODAY.get()


def news_data(cfg=None):
    """休憩中に表示するニュース（表示しない設定・取得元なしのときは取りに行かない）"""
    n = (cfg or STORE.load())["news"]
    if not n.get("enabled", True) or not n.get("feeds"):
        return None
    return NEWS.get(n["feeds"], n["words"], n["exclude"])


@bp.route("/")
def index():
    return render_template("chime/chime.html", plan_json=core.plan_json_for_page(),
                           chime_json=core.to_page_json(STORE.load()), today_json=core.to_page_json(today_data()),
                           news_json=core.to_page_json(news_data()))


@bp.route("/manifest.webmanifest")
def manifest():
    """アプリとしてインストールするための情報（名前・アイコン・開く画面）。/tools/ の下でも手元でも正しいURLになるよう url_for で作る"""
    start = url_for("chime.index")
    data = {
        "id": start,
        "name": "チャイム",
        "short_name": "チャイム",
        "description": "教室のPCで表示する時計とチャイム（授業用ツール）",
        "lang": "ja",
        "start_url": start,
        "scope": start,
        "display": "standalone",  # アドレスバー・タブのない専用ウィンドウ（タスクバーは残る）
        "background_color": "#000000",
        "theme_color": "#1c3f94",
        "icons": [
            {"src": url_for("static", filename="icon-192.png"), "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": url_for("static", filename="icon-512.png"), "sizes": "512x512", "type": "image/png", "purpose": "any"},
        ],
    }
    return Response(json.dumps(data, ensure_ascii=False), mimetype="application/manifest+json",
                    headers={"Cache-Control": "no-cache"})


@bp.route("/media/<path:name>")
def media(name):
    return send_from_directory(STORE.media_dir, Store.safe_name(name), max_age=3600)


def render_admin(message="", status=200):
    media = STORE.list_media()
    today = today_data()
    news = news_data()
    return render_template("chime/admin.html", message=message,
                           plan_json=core.plan_json_for_page(),
                           chime_json=core.to_page_json(STORE.load()),
                           media_json=core.to_page_json(media),
                           media=media, usage=STORE.usage(),
                           today=today, today_json=core.to_page_json(today),
                           news=news, news_json=core.to_page_json(news),
                           cfg_news=STORE.load()["news"]), status


def back(msg):
    # 再読み込みで二重送信しないよう、保存後は GET に切り替える
    return redirect(url_for("chime.admin", msg=msg), code=303)


@bp.route("/admin", methods=["GET"])
def admin():
    core.require_admin()
    return render_admin(request.args.get("msg", ""))


@bp.route("/admin", methods=["POST"])
def admin_save():
    core.require_admin_post()
    try:
        data = STORE.save(json.loads(request.form.get("chime", "")))
    except (ValueError, TypeError, AttributeError) as e:
        return render_admin(f"保存できませんでした：{e}", 400)
    return back(f"{data['updated']} に保存しました")


@bp.route("/admin/upload", methods=["POST"])
def admin_upload():
    core.require_admin_post()
    names, errors = [], []
    for f in request.files.getlist("files"):
        if not f or not f.filename:
            continue
        try:
            names.append(STORE.add_media(f))
        except ValueError as e:
            errors.append(str(e))
    msg = "　".join(([("アップロードしました：" + "、".join(names))] if names else []) + errors)
    return back(msg or "ファイルが選ばれていません")


@bp.route("/admin/today", methods=["POST"])
def admin_today_refresh():
    """「今日は何の日？」を Wikipedia から取り直す"""
    core.require_admin_post()
    d = TODAY.refresh(date.today())
    if d.get("error"):
        return back(f"「今日は何の日？」を取得できませんでした（{d['error']}）")
    return back(f"「今日は何の日？」を取得しました（記念日 {len(d['anniversaries'])} 件・IT関連 {len(d['it_events'])} 件）")


@bp.route("/admin/news", methods=["POST"])
def admin_news_refresh():
    """ニュースを取り直す（保存済みの設定の取得元・語句で）"""
    core.require_admin_post()
    n = STORE.load()["news"]
    d = NEWS.refresh(n["feeds"], n["words"], n["exclude"])
    msg = f"ニュースを取得しました（{len(d.get('items', []))} 件）"
    if d.get("errors"):
        msg += "。取得できなかった取得元：" + "／".join(d["errors"])
    return back(msg)


@bp.route("/admin/delete", methods=["POST"])
def admin_delete():
    core.require_admin_post()
    name = request.form.get("name", "")
    try:
        STORE.delete_media(name)
        msg = f"削除しました：{name}"
    except ValueError as e:
        msg = str(e)
    return back(msg)
