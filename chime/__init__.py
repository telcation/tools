"""
チャイム（/tools/chime/）… デスクトップ版 chimeApp.py の Web 版
------------------------------------------------
  /tools/chime/              教室のPCで全画面表示するチャイム画面（パスワードなし。個人情報は含まない）
  /tools/chime/media/<名前>  アップロードした素材（チャイム音・画像・BGM）
  /tools/chime/admin         チャイムの設定（講師用・パスワード付き）
"""
import json

from flask import Blueprint, redirect, render_template, request, send_from_directory, url_for

import core
from .store import Store

bp = Blueprint("chime", __name__, template_folder="templates",
               static_folder="static", static_url_path="/static")
STORE = Store(core.DATA_DIR)


@bp.route("/")
def index():
    return render_template("chime/chime.html", plan_json=core.plan_json_for_page(),
                           chime_json=core.to_page_json(STORE.load()))


@bp.route("/media/<path:name>")
def media(name):
    return send_from_directory(STORE.media_dir, Store.safe_name(name), max_age=3600)


def render_admin(message="", status=200):
    media = STORE.list_media()
    return render_template("chime/admin.html", message=message,
                           plan_json=core.plan_json_for_page(),
                           chime_json=core.to_page_json(STORE.load()),
                           media_json=core.to_page_json(media),
                           media=media, usage=STORE.usage()), status


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
