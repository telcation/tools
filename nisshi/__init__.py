"""
訓練日誌 下書きツール（/tools/nisshi/）
------------------------------------------------
登録済みの日別計画表（日付・訓練内容・時間）をページに埋め込んで配るだけです。
名簿の読み込み、出欠・感想の入力、印刷はすべてブラウザの中で行い、
氏名や感想（個人情報）はサーバーに送信・保存しません。
"""
from flask import Blueprint, render_template

import core

bp = Blueprint("nisshi", __name__, template_folder="templates",
               static_folder="static", static_url_path="/static")


@bp.route("/")
def index():
    return render_template("nisshi/index.html", plan_json=core.plan_json_for_page())
