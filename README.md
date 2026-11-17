# 授業用ツール（tools）

職業訓練の授業で使う Web ツールをまとめたリポジトリです。1つの Flask アプリとして自宅サーバーで動かします。

| ツール | URL | フォルダ |
|---|---|---|
| トップページ | `https://telcation.f5.si/tools/` | `templates/index.html` |
| 訓練日誌 下書きツール | `https://telcation.f5.si/tools/nisshi/` | `nisshi/` |
| チャイム（教室のPCで全画面表示） | `https://telcation.f5.si/tools/chime/` | `chime/` |
| 日別計画表の登録（講師用・パスワード付き） | `https://telcation.f5.si/tools/admin` | `app.py`・`templates/admin.html` |
| チャイムの設定（講師用・パスワード付き） | `https://telcation.f5.si/tools/chime/admin` | `chime/` |
| 名前ピッカー | `https://telcation.f5.si/tools/namepicker/` | `namepicker/` |

- アプリのポート：`5012`（nginx から `127.0.0.1:5012` へ転送。サービス名 `tools`）
- 日別計画表と講師用パスワードは、全ツールで共通です
- 以前の URL（`/nisshi/`・`/namepicker/`）は新しい URL へ自動で転送します

## 訓練日誌 下書きツール（nisshi）

事前に登録した日別計画表（認定様式第6号）から当日の訓練科目を自動で入れ、訓練日誌（実施様式1）の清書前の下書きを作ります。

- 氏名・感想はブラウザの中だけで処理し、**サーバーには送信・保存しません**
- 本紙は留意事項①のとおり受講者がボールペンで手書きします。このツールは転記用の下書きです

### 個人情報を扱わない仕組み

| しくみ | 内容 |
|---|---|
| ブラウザ内処理 | 名簿読み込み・出欠・感想入力・印刷、日別計画表PDFの読み取りはすべて JavaScript で実行 |
| 通信の禁止 | `Content-Security-Policy: connect-src 'none'` / `form-action 'none'` により、受講者用画面からの通信自体をブラウザが拒否（日程はページに埋め込んで配る） |
| 保存しない | localStorage 等も使わないため、再読み込み・タブを閉じると入力内容は消える |
| ログに残らない | サーバーのアクセスログには `GET /` や `GET /static/app.js` しか記録されない |
| 講師名を登録しない | 日別計画表から登録するのは「日付・訓練内容・時間」だけ。担当講師名はブラウザ側で捨て、サーバー側でも受け付けない。PDF そのものも送信しない |

## 名前ピッカー（namepicker）

名簿テキストファイルを読み込み、欠席者を除いて「ランダム並び替え」「ランダムに1名指名」を行います（以前の [namepicker](https://github.com/telcation/namepicker) リポジトリを統合）。

- 名前はブラウザの中だけで処理し、**サーバーには送信・保存しません**（通信は CSP で禁止）
- 名簿の書き方は下の「名簿ファイルの書き方」と同じです（動作確認用：`namepicker/sample_names.txt`）
- 「ドキュメントフォルダを最初に開く」動作は Chrome / Edge かつ HTTPS のときだけ有効です

## 日別計画表（認定様式第6号）の登録（講師用・全ツール共通）

1. トップページの「日別計画表の登録・更新」、または `/tools/admin` を開く
2. ユーザー名は何でもよく、パスワードに講師用パスワード（2-2 で設定）を入力
3. 「日別計画表PDFを開く」で PDF を選ぶ。PDF はブラウザの中（pdf.js）で読み取るだけで送信しない
4. 一覧と「合計 ○H」を確認し、「この内容で登録する」を押す
   - 合計が PDF の「時間合計」と同じなら正しく読めています
   - 日程変更で登録し直すと、前回との違い（変更・追加・削除）が色付きで表示されます

| 登録する項目 | PDFのどこから | 訓練日誌での使われ方 |
|---|---|---|
| 日付 | 「月/日」の行（年は2ページ目の実施期間「令和○年…」から） | 訓練日の選択肢 |
| 訓練内容 | 「訓練内容」欄の名称 | 全時限の「訓練科目」（先頭の「（実技）」「（学科）」は既定で外す。画面のチェックで付けられる） |
| 時間 | 「時間」の行 | 時限数（6H なら1〜6時限、2H なら1〜2時限）。0H の日（キャリアコンサルティング等）は訓練時間外として案内 |
| 時間割表 | 2ページ目の「1限目 10:10〜11:00」… | （チャイムの時刻の初期値に使う） |

- **担当講師名は登録しません。** 受講者用画面で「講師名」を入力すると、訓練のある時限へ反映されます
- 登録データの置き場所：サーバーの `/home/appuser/apps/tools-data/plan.json`（1つ前の登録は `plan.prev.json`）
  - アプリのフォルダの外なので、自動デプロイ（`rsync --delete`）で消えません
  - 登録を1つ前に戻す場合：`cp ~/apps/tools-data/plan.prev.json ~/apps/tools-data/plan.json`
- 様式のレイアウトが変わって読めなくなった場合は `static/plan_parser.js` を調整します

## チャイム（chime の Web 版）

デスクトップ版 [chime](https://github.com/telcation/chime)（`chimeApp.py`）を、登録済みの日別計画表と組み合わせて Web で動かすものです。

### 教室のPCでの使い方

**おすすめ：起動用ファイル `chime/start_chime.bat` から開く**（教室のPCにコピーしてダブルクリック）

- Edge が「アプリモード」（アドレスバー・タブなし）で、最大化した状態で開きます。**タスクバーは残ります**（デスクトップ版の「画面いっぱいに表示」と同じ見え方）
- チャイム専用の Edge プロファイルで開くため、**クリックしなくても音が鳴ります**（ふだん使う Edge の設定には影響しません）
- ショートカットのアイコンをクラスロゴにしたいときは、ショートカットの「プロパティ」→「アイコンの変更」で `static\favicon.ico` を選びます
- サインイン時に自動で起動したいときは、`Win + R` →「`shell:startup`」で開くフォルダに、このファイルのショートカットを置きます

**ブラウザで直接開く場合**

1. Chrome / Edge で `/tools/chime/` を開く
2. 「チャイムを開始する」をクリック（**ブラウザの決まりで、最初に一度クリックしないと音を鳴らせません**）
3. 右下の「全画面」で全画面表示（**ブラウザの全画面はタスクバーも隠れます**。ページ側からタスクバーだけ残すことはできません）

共通の注意

- マウスを4秒動かさないと、ボタンとカーソルが消えます
- タブ（ウィンドウ）は表示したままにする（別のタブや最小化のままだと、省電力機能でチャイムが遅れることがあります）
- 日付が変わると自動で読み込み直し、その日の日程・最新の設定になります。設定を変更した当日は、ページを読み込み直す（`F5`）と反映されます
- 右下の「手動切替」で、手動切替の項目・準備中画面・スケジュールの各表示に切り替えられます。次のチャイムの時刻で自動的にスケジュールに戻ります

### デスクトップ版との対応

| デスクトップ版 | Web 版（講師用の `/tools/chime/admin` で編集） |
|---|---|
| スケジュールファイル（HH:MM 画像 表示文字 色 大きさ フォント BGM） | 「チャイム時刻」。日別計画表の時間割表から自動で作成（各時限の開始・終了、昼休み、質疑応答、終了） |
| 日程Excelの「テキスト」「ツール」 | 「科目ごと」に設定し、必要な日だけ「日ごとの上書き」 |
| 表示設定.txt | 「手動切替の項目」 |
| config.txt（背景色・画像の大きさ・準備中画面の文字） | 「基本設定」。日付・時刻の文字色（初期値：黒）と、画像の合わせ方（初期値：横幅に合わせる）も選べる |
| chime.wav ／ 準備中.png ／ 準備中.mp3 | 「素材」にアップロードして「基本設定」で選ぶ（チャイム音がないときは標準の電子音） |
| （なし） | 日別計画表の訓練日だけ鳴らす（土日・祝日・0Hの日は鳴らさない） |

- 「チャイム時刻」の「テスト実行」で、準備中画面と各時刻の表示を画面いっぱいに1つずつ確認できます。画面をクリック（→ / Space / Enter）で次へ、← で前へ、最後の画面でクリックすると終了（チャイム・BGMは鳴らない。保存前の内容で確認できる。Esc で停止）
- 準備中画面の下半分に「**今日は何の日？**」を表示します。日本語版 Wikipedia の日付ページ（例：「11月16日」）から、記念日・年中行事（最大6件、日本のものを先に）と、IT・コンピュータに関係するできごと（最大3件）をサーバーが取り出して表示します
  - 1度取得した日は `~/apps/tools-data/today/` に保存し、30日間そのまま使います（翌日以降の3日分も先に取得）。取得できないときは前回の内容を表示します
  - チャイムの設定の「2. 今日は何の日？」で今日の内容の確認・取り直し、「基本設定」で表示の有無・文字の大きさ・位置を変更できます
  - 画面の下端に収まらないときは、文字を自動で小さくします（設定の大きさの40%まで。それでも入らないときは項目を減らします）
  - サーバーから `ja.wikipedia.org` に接続できる必要があります。画面には出典（Wikipedia・CC BY-SA）を表示します
- 「チャイム時刻」の表示文字に「**休憩**」を含む時刻の画面では、下半分に **Java・Python 関連のニュース**（見出し・媒体名・日付、最大5件）を表示します（中央の文字は上に寄せる）
  - 取得元（初期値）：Google ニュースの検索結果（日本語）、Publickey、＠IT の RSS / Atom。タイトルに Java・Python 関連の語句（Java、Python、JDK、Spring Boot、Django、Flask など）を含む記事だけを選び、「ジャワ」「コーヒー」などを含む記事は除きます（「JavaScript」は Java と数えません）
  - サーバーが取得して `~/apps/tools-data/news.json` に保存し、3時間ごとに新しくします。表示画面は日付が変わると読み込み直すので、その時点の内容になります
  - チャイムの設定の「休憩中のニュース」で取得状況の確認・取り直し、「基本設定」→「詳細設定」で、表示の有無・ニュースを出す語（例：休憩・昼休み）・件数・大きさ・位置・取得元・選ぶ語句・除外する語句を変更できます
- 保存場所：設定は `~/apps/tools-data/chime.json`（1つ前は `chime.prev.json`）、素材は `~/apps/tools-data/media/`
- 素材とチャイム表示画面はパスワードなしで見られます。**個人情報を含む画像・文字は使わないでください**

## 名簿ファイルの書き方

```
# 1行に1名ずつ（# で始まる行と空行は無視）
青木 一郎
石川 花子
```

- 文字コードは UTF-8（BOM あり／なし）と Shift_JIS に対応
- CSV の場合は1列目を名前として扱います
- 実際の名簿は `names*.txt`・`roster*.txt`・`名簿*` という名前にしておくと `.gitignore` によりコミットされません

## ファイル構成

```
tools/
├─ app.py                  Flask 本体：トップページ・日別計画表の登録・セキュリティ設定
├─ core.py                 共通処理：データの置き場所・日別計画表の検査と保存・講師用パスワード
├─ requirements.txt
├─ templates/
│   ├─ _icons.html         全ページ共通のアイコン指定
│   ├─ index.html          トップページ（ツールの一覧）
│   └─ admin.html          日別計画表の登録（講師用）
├─ static/                 共通の CSS・JS・アイコン
│   ├─ style.css
│   ├─ favicon.ico / favicon-32.png / icon-192.png / icon-512.png / apple-touch-icon.png  クラスロゴのアイコン
│   ├─ admin.js            日別計画表の登録画面
│   ├─ plan_parser.js      日別計画表PDFの読み取り（時間割表を含む）
│   └─ vendor/pdfjs/       pdf.js 4.10.38（Apache License 2.0）
├─ nisshi/                 訓練日誌 下書きツール（/tools/nisshi/）
│   ├─ __init__.py
│   ├─ templates/nisshi/index.html
│   └─ static/app.js
├─ chime/                  チャイム（/tools/chime/）
│   ├─ __init__.py         画面と講師用の保存・アップロード
│   ├─ store.py            チャイム設定と素材の保存・検査
│   ├─ today.py            「今日は何の日？」の取得（Wikipedia）・解析・保存
│   ├─ news.py             休憩中の Java・Python ニュースの取得（RSS / Atom）・選別・保存
│   ├─ start_chime.bat     教室のPC用の起動ファイル（Edge のアプリモード・最大化）
│   ├─ templates/chime/chime.html / admin.html
│   └─ static/chime.js / chime.css / admin_chime.js / chime_common.js
├─ namepicker/             名前ピッカー（/tools/namepicker/）
│   ├─ __init__.py
│   ├─ templates/namepicker/index.html
│   ├─ static/app.js / style.css
│   └─ sample_names.txt    動作確認用のダミー名簿
├─ sample_roster.txt       動作確認用のダミー名簿
├─ deploy/
│   ├─ tools.service       systemd 設定
│   ├─ nginx_tools.conf    nginx 追記内容（旧 /nisshi/・/namepicker/ からの転送つき）
│   └─ sudoers_tools       再起動許可の設定
└─ .github/workflows/deploy.yml  自動デプロイ
```

新しいツールを追加するときは、`chime/` と同じ形のフォルダ（Blueprint）を作り、`app.py` で `register_blueprint` します。
テンプレートのリンクや読み込み先は、`/tools/` の下でも手元でも動くよう `url_for()` で書きます。

---

## 1. PyCharm で動かす（ローカル）

Community 版・Professional 版のどちらでも動きます（Flask 専用の実行構成は使わず、通常の Python 実行構成にしてあるため）。

1. 「ファイル」→「開く」で `tools` フォルダを選ぶ（「プロジェクトを信頼」を選択）
2. 画面上部に「Python インタープリターが構成されていません」と出たら「インタープリターの構成」→「ローカルインタープリターを追加」→「Virtualenv 環境」→「新規」で、場所を `プロジェクトフォルダ/venv` にして作成
   （通知が出ない場合は「ファイル」→「設定」→「プロジェクト: tools」→「Python インタープリター」から設定）
3. 「requirements.txt の依存関係をインストール」の通知が出たら「インストール」（出ない場合はターミナルで `pip install -r requirements.txt`）
4. 右上の実行構成で「app（http://127.0.0.1:5012/）」を選んで ▶ 実行
5. `http://127.0.0.1:5012/admin` を開き、日別計画表PDFを登録する
   （手元では初回実行時に開発用パスワードが自動で作られます。中身は `PycharmProjects\tools-data\admin_password`）
6. `http://127.0.0.1:5012/` のトップページから、訓練日誌（`sample_roster.txt` を読み込んで確認）・チャイム・名前ピッカー（`namepicker/sample_names.txt`）を開く

### GitHub リポジトリにする

1. 「VCS」→「バージョン管理統合を有効にする」→ Git
   （メニューにこの項目が無い場合は、ターミナルで `git init -b main` を実行）
2. 「Git」→「コミット」で全ファイルをコミット（`.github` と `.idea` の設定ファイルも含める）
3. 「Git」→「GitHub」→「GitHub でプロジェクトを共有」でリポジトリを作成・プッシュ

プッシュ時点で自動デプロイが動くので、先に 2章・3章の設定を済ませておくとエラーになりません。

## 2. サーバーの初回設定（1回だけ）

すでに nisshi として動かしている場合は、この章ではなく「**5. nisshi から tools への移行**」の手順を行ってください。

`deploy/` フォルダのファイルは自動デプロイでは転送されません（サーバーの設定ファイルなので、手作業で1回だけ置きます）。

### 2-1. 手元のPCからファイルを送る（PyCharm のターミナル）

```powershell
scp deploy\tools.service deploy\sudoers_tools deploy\nginx_tools.conf home:~/
```

`home` は SSH 設定（`~\.ssh\config`）の Host 名です。設定が無い場合は次のように指定します。

```powershell
scp -i $HOME\.ssh\id_rsa_appuser deploy\tools.service deploy\sudoers_tools deploy\nginx_tools.conf appuser@telcation.f5.si:~/
```

### 2-2. サーバーで設定する（`ssh home` で接続）

```bash
# アプリ置き場と、登録データ・パスワードの置き場（デプロイで消えないよう別フォルダ）
mkdir -p ~/apps/tools
mkdir -p -m 700 ~/apps/tools-data

# 講師用画面のパスワード（自分で決めた文字列を1行で書いて保存）
nano ~/apps/tools-data/admin_password
chmod 600 ~/apps/tools-data/admin_password

# systemd
sudo cp ~/tools.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable tools

# 再起動の許可（GitHub Actions 用）。visudo -c で書式を確認してから置く
sudo visudo -c -f ~/sudoers_tools \
  && sudo install -m 440 -o root -g root ~/sudoers_tools /etc/sudoers.d/tools

# nginx：有効な設定ファイルは sites-enabled/telcation.conf（実ファイル）
#        ※ sites-available/telcation.conf は使われていない古いファイルなので編集しない
# (1) バックアップ（sites-enabled の中に置くと nginx が読み込んでしまうので、ホームに置く）
sudo cp /etc/nginx/sites-enabled/telcation.conf ~/telcation.conf.bak

# (2) 貼り付け位置を確認：namepicker の location の行番号を調べる
grep -n "location /namepicker/" /etc/nginx/sites-enabled/telcation.conf

# (3) その行番号を付けて開き、namepicker の location ブロック（閉じカッコ } まで）の
#     すぐ下に ~/nginx_tools.conf の内容を貼り付ける（例：行番号が 120 なら +120）
cat ~/nginx_tools.conf
sudo nano +<上で調べた行番号> /etc/nginx/sites-enabled/telcation.conf

# (4) 書式チェックして反映（エラーなら (1) のバックアップで戻す）
sudo nginx -t && sudo systemctl reload nginx
#   戻す場合：sudo cp ~/telcation.conf.bak /etc/nginx/sites-enabled/telcation.conf

# 送ったファイルの片付け
rm ~/tools.service ~/sudoers_tools ~/nginx_tools.conf ~/telcation.conf.bak
```

初回デプロイが成功するまでは `systemctl start` はエラーになります（venv がまだ無いため）。

## 3. GitHub の設定

namepicker で作成済みの鍵・Secrets の値（`SSH_HOST` など5つ）をそのまま使い回せます。その場合は下の「リポジトリの Secrets」で同じ値を登録するだけです。

### デプロイ用の SSH 鍵（手元のPCで作成）

```powershell
ssh-keygen -t ed25519 -f $HOME\.ssh\deploy_nisshi -C "github-actions-nisshi"
```

- パスフレーズを2回聞かれるので、何も入力せず Enter を2回押す
  （PowerShell では `-N ""` の空文字が渡らず「Too many arguments」になるため、`-N` は付けない）
- 鍵は必ずプロジェクトの外（`.ssh` フォルダ）に作る。プロジェクト内に作るとコミットで秘密鍵が GitHub に上がる危険がある
- 公開鍵 `deploy_nisshi.pub` をサーバーの `~appuser/.ssh/authorized_keys` に追記する

  ① 手元のPC（PowerShell）から公開鍵を送る（`.pub` の方。秘密鍵 `deploy_nisshi` は送らない）

  ```powershell
  scp $HOME\.ssh\deploy_nisshi.pub home:~/
  ```

  ② サーバー（`ssh home`）で追記する

  ```bash
  mkdir -p ~/.ssh && chmod 700 ~/.ssh
  cat ~/deploy_nisshi.pub >> ~/.ssh/authorized_keys
  chmod 600 ~/.ssh/authorized_keys
  rm ~/deploy_nisshi.pub

  # 追記できたか確認（github-actions-nisshi で終わる行が1行だけ出ればOK）
  grep github-actions-nisshi ~/.ssh/authorized_keys
  ```

  ③ 手元のPC（PowerShell）で、新しい鍵だけで接続できるか確認する（`ok` と表示されれば成功）

  ```powershell
  ssh -i $HOME\.ssh\deploy_nisshi -o IdentitiesOnly=yes appuser@telcation.f5.si "echo ok"
  ```

  ※ 2行以上出た場合は、同じ鍵を2回追記しています。害はありませんが、`nano ~/.ssh/authorized_keys` で重複行を1行消してください。
- `SSH_KNOWN_HOSTS` 用の値を控える。手元のPC（PowerShell）で次を実行し、表示された行（3行程度）をすべてコピーする

  ```powershell
  ssh home "ssh-keyscan localhost 2>/dev/null | sed 's/^localhost/telcation.f5.si/'"
  ```

  ※ サーバー自身に鍵を読み取らせ、ホスト名を `telcation.f5.si` に置き換えています。
  　Windows の `ssh-keyscan telcation.f5.si` は使わないこと。Windows 版 OpenSSH の不具合で
  　`choose_kex: unsupported KEX method sntrup761x25519-sha512@openssh.com` となり、鍵を取得できません。

### リポジトリの Secrets

GitHub のリポジトリ →「Settings」→「Secrets and variables」→「Actions」→「New repository secret」

| 名前 | 値 |
|---|---|
| `SSH_HOST` | `telcation.f5.si` |
| `SSH_PORT` | `22` |
| `SSH_USER` | `appuser` |
| `SSH_PRIVATE_KEY` | `deploy_nisshi`（秘密鍵）の中身すべて |
| `SSH_KNOWN_HOSTS` | 上の `ssh-keyscan` の出力（3行程度） |

## 4. PyCharm からデプロイ

1. 「Git」→「コミット」で変更をコミット
2. 「Git」→「プッシュ」で `main` ブランチへプッシュ
3. GitHub の「Actions」タブで「自宅サーバーへデプロイ（tools）」が緑になれば完了

## 5. nisshi・namepicker から tools への移行（1回だけ）

以前の nisshi（`~/apps/nisshi`・サービス `nisshi`・URL `/nisshi/`）と namepicker（`~/apps/namepicker`・サービス `namepicker`・ポート5011・URL `/namepicker/`）から切り替える手順です。
日別計画表・講師用パスワード・チャイムの設定と素材は、データフォルダの名前を変えるだけでそのまま使えます。

### 5-1. GitHub のリポジトリ名を変える

GitHub の nisshi リポジトリ →「Settings」→「General」→「Repository name」を `tools` にして「Rename」。
履歴と Secrets（`SSH_HOST` など5つ）はそのまま残ります。手元の Git も古い URL のまま動きますが、念のため PyCharm のターミナルで次を実行します。

```powershell
git remote set-url origin https://github.com/telcation/tools.git
```

### 5-2. 手元のPCからファイルを送る（PyCharm のターミナル）

```powershell
scp deploy\tools.service deploy\sudoers_tools deploy\nginx_tools.conf home:~/
```

### 5-3. サーバーで切り替える（`ssh home` で接続）

```bash
# (1) 古い nisshi・namepicker を止めて、自動起動と再起動の許可を外す（nisshi は同じ 5012 番を使うため先に止める）
sudo systemctl disable --now nisshi namepicker
sudo rm /etc/systemd/system/nisshi.service /etc/sudoers.d/nisshi
sudo rm /etc/systemd/system/namepicker.service /etc/sudoers.d/namepicker
sudo systemctl daemon-reload

# (2) データフォルダの名前を変える（日別計画表・パスワード・チャイム設定・素材）
mv ~/apps/nisshi-data ~/apps/tools-data

# (3) 新しいアプリ置き場と systemd・再起動の許可
mkdir -p ~/apps/tools
sudo cp ~/tools.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable tools
sudo visudo -c -f ~/sudoers_tools \
  && sudo install -m 440 -o root -g root ~/sudoers_tools /etc/sudoers.d/tools

# (4) nginx：/nisshi/ と /namepicker/ の location ブロック
#     （location = /nisshi・location /nisshi/・location = /namepicker・location /namepicker/）を削除し、
#     同じ場所に ~/nginx_tools.conf の内容を貼り付ける
sudo cp /etc/nginx/sites-enabled/telcation.conf ~/telcation.conf.bak
grep -n "nisshi\|namepicker" /etc/nginx/sites-enabled/telcation.conf
cat ~/nginx_tools.conf
sudo nano +<上で表示された最初の行番号> /etc/nginx/sites-enabled/telcation.conf
sudo nginx -t && sudo systemctl reload nginx
#   戻す場合：sudo cp ~/telcation.conf.bak /etc/nginx/sites-enabled/telcation.conf

# (5) 片付け（古いアプリ置き場は、tools の動作を確認してから消してもよい）
rm ~/tools.service ~/sudoers_tools ~/nginx_tools.conf
```

### 5-4. プッシュしてデプロイ

PyCharm でコミット・プッシュし、GitHub の「Actions」で「自宅サーバーへデプロイ（tools）」が緑になれば完了です。
`https://telcation.f5.si/tools/` を開いて確認し、問題なければ `rm -rf ~/apps/nisshi ~/apps/namepicker ~/telcation.conf.bak` で古いアプリ置き場を消します。

### 5-5. namepicker リポジトリの片付け

namepicker リポジトリにプッシュすると、古い自動デプロイ（`~/apps/namepicker`・`systemctl restart namepicker`）が動いて失敗します。
GitHub の namepicker リポジトリ →「Settings」→「General」のいちばん下「Archive this repository」で読み取り専用にしておくと安全です（履歴はそのまま見られます）。

## 注意点

- GitHub のサーバーから自宅へ SSH するため、SSH ポートを外部公開する必要があります。パスワード認証は無効にし、鍵認証のみにしてください。SSH を外部に開けたくない場合は、サーバーに **セルフホストランナー** を入れて `runs-on: self-hosted` に変える方法があります。
- 「ドキュメントフォルダを最初に開く」動作（訓練日誌・名前ピッカー）は Chrome / Edge かつ HTTPS のときだけ有効です。Firefox / Safari では通常のファイル選択画面になります。
