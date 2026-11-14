"""
名前ピッカー（/tools/namepicker/）
------------------------------------------------
名簿テキストファイルを読み込み、欠席者を除いて「ランダム並び替え」「ランダムに1名指名」を行います。
このサーバーは HTML / CSS / JavaScript を配るだけで、名簿の読み込み・並び替え・指名は
すべてブラウザの中で行います。名前（個人情報）はサーバーに送信・保存しません。
（以前の namepicker リポジトリ・ポート5011 から統合）
"""
from flask import Blueprint, render_template

bp = Blueprint("namepicker", __name__, template_folder="templates",
               static_folder="static", static_url_path="/static")


@bp.route("/")
def index():
    return render_template("namepicker/index.html")
