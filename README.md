# 訓練日誌 下書きツール（nisshi）

事前に登録した日別計画表（認定様式第6号）から当日の訓練科目を自動で入れ、訓練日誌（実施様式1）の清書前の下書きを作るWebアプリです。

- 受講者用：`https://telcation.f5.si/nisshi/`
- 講師用（日別計画表の登録・パスワード付き）：`https://telcation.f5.si/nisshi/admin`
- チャイム表示（教室のPCで全画面表示）：`https://telcation.f5.si/nisshi/chime`
- チャイムの設定（講師用・パスワード付き）：`https://telcation.f5.si/nisshi/admin-chime`
- アプリのポート：`5012`（nginx から `127.0.0.1:5012` へ転送）
- 氏名・感想はブラウザの中だけで処理し、**サーバーには送信・保存しません**
- 本紙は留意事項①のとおり受講者がボールペンで手書きします。このツールは転記用の下書きです

## 個人情報を扱わない仕組み

| しくみ | 内容 |
|---|---|
| ブラウザ内処理 | 名簿読み込み・出欠・感想入力・印刷、日別計画表PDFの読み取りはすべて JavaScript で実行 |
| 通信の禁止 | `Content-Security-Policy: connect-src 'none'` / `form-action 'none'` により、受講者用画面からの通信自体をブラウザが拒否（日程はページに埋め込んで配る） |
| 保存しない | localStorage 等も使わないため、再読み込み・タブを閉じると入力内容は消える |
| ログに残らない | サーバーのアクセスログには `GET /` や `GET /static/app.js` しか記録されない |
| 講師名を登録しない | 日別計画表から登録するのは「日付・訓練内容・時間」だけ。担当講師名はブラウザ側で捨て、サーバー側でも受け付けない。PDF そのものも送信しない |

## 日別計画表（認定様式第6号）の登録（講師用画面）

1. 受講者用画面の下にある「日別計画表の登録・更新（講師用）」、または `/nisshi/admin` を開く
2. ユーザー名は何でもよく、パスワードに講師用パスワード（2-2 で設定）を入力
3. 「日別計画表PDFを開く」で PDF を選ぶ。PDF はブラウザの中（pdf.js）で読み取るだけで送信しない
4. 一覧と「合計 ○H」を確認し、「この内容で登録する」を押す
   - 合計が PDF の「時間合計」と同じなら正しく読めています
   - 日程変更で登録し直すと、前回との違い（変更・追加・削除）が色付きで表示されます

| 登録する項目 | PDFのどこから | 受講者用画面での使われ方 |
|---|---|---|
| 日付 | 「月/日」の行（年は2ページ目の実施期間「令和○年…」から） | 訓練日の選択肢 |
| 訓練内容 | 「訓練内容」欄の名称 | 全時限の「訓練科目」（先頭の「（実技）」「（学科）」は既定で外す。画面のチェックで付けられる） |
| 時間 | 「時間」の行 | 時限数（6H なら1〜6時限、2H なら1〜2時限）。0H の日（キャリアコンサルティング等）は訓練時間外として案内 |

- **担当講師名は登録しません。** 受講者用画面で「講師名」を入力すると、訓練のある時限へ反映されます
- 登録データの置き場所：サーバーの `/home/appuser/apps/nisshi-data/plan.json`（1つ前の登録は `plan.prev.json`）
  - アプリのフォルダの外なので、自動デプロイ（`rsync --delete`）で消えません
  - 登録を1つ前に戻す場合：`cp ~/apps/nisshi-data/plan.prev.json ~/apps/nisshi-data/plan.json`
- 様式のレイアウトが変わって読めなくなった場合は `static/plan_parser.js` を調整します

## チャイム（chime の Web 版）

デスクトップ版 [chime](https://github.com/telcation/chime)（`chimeApp.py`）を、登録済みの日別計画表と組み合わせて Web で動かすものです。

### 教室のPCでの使い方

1. ブラウザ（Chrome / Edge）で `/nisshi/chime` を開く
2. 「チャイムを開始する」をクリック（**ブラウザの決まりで、最初に一度クリックしないと音を鳴らせません**）
3. 右下の「全画面」で全画面表示。マウスを4秒動かさないと、ボタンとカーソルが消えます
4. タブは表示したままにする（別のタブや最小化のままだと、省電力機能でチャイムが遅れることがあります）

- 日付が変わると自動で読み込み直し、その日の日程・最新の設定になります。設定を変更した当日は、ページを読み込み直すと反映されます
- 右下の「手動切替」で、手動切替の項目・準備中画面・スケジュールの各表示に切り替えられます。次のチャイムの時刻で自動的にスケジュールに戻ります

### デスクトップ版との対応

| デスクトップ版 | Web 版（講師用の `/nisshi/admin-chime` で編集） |
|---|---|
| スケジュールファイル（HH:MM 画像 表示文字 色 大きさ フォント BGM） | 「チャイム時刻」。日別計画表の時間割表から自動で作成（各時限の開始・終了、昼休み、質疑応答、終了） |
| 日程Excelの「テキスト」「ツール」 | 「科目ごと」に設定し、必要な日だけ「日ごとの上書き」 |
| 表示設定.txt | 「手動切替の項目」 |
| config.txt（背景色・画像の大きさ・準備中画面の文字） | 「基本設定」 |
| chime.wav ／ 準備中.png ／ 準備中.mp3 | 「素材」にアップロードして「基本設定」で選ぶ（チャイム音がないときは標準の電子音） |
| （なし） | 日別計画表の訓練日だけ鳴らす（土日・祝日・0Hの日は鳴らさない） |

- 保存場所：設定は `~/apps/nisshi-data/chime.json`（1つ前は `chime.prev.json`）、素材は `~/apps/nisshi-data/media/`
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
nisshi/
├─ app.py                     Flask（画面の配信・日別計画表の登録）
├─ chime_store.py             チャイム設定と素材の保存・検査
├─ requirements.txt
├─ templates/index.html       受講者用画面
├─ templates/admin.html       講師用画面（日別計画表の登録）
├─ templates/chime.html       チャイム表示画面
├─ templates/admin_chime.html チャイムの設定（講師用）
├─ static/style.css
├─ static/app.js              処理の本体（ブラウザ側）
├─ static/admin.js            講師用画面の処理
├─ static/chime.js / chime.css      チャイム表示画面
├─ static/admin_chime.js      チャイムの設定画面
├─ static/chime_common.js     チャイムの共通処理（時間割表からの時刻作成など）
├─ static/plan_parser.js      日別計画表PDFの読み取り
├─ static/vendor/pdfjs/       pdf.js 4.10.38（Apache License 2.0）
├─ sample_roster.txt           動作確認用のダミー名簿
├─ deploy/
│   ├─ nisshi.service     systemd 設定
│   ├─ nginx_nisshi.conf  nginx 追記内容
│   └─ sudoers_nisshi     再起動許可の設定
└─ .github/workflows/deploy.yml  自動デプロイ
```

---

## 1. PyCharm で動かす（ローカル）

Community 版・Professional 版のどちらでも動きます（Flask 専用の実行構成は使わず、通常の Python 実行構成にしてあるため）。

1. zip を展開し、「ファイル」→「開く」で `nisshi` フォルダを選ぶ（「プロジェクトを信頼」を選択）
2. 画面上部に「Python インタープリターが構成されていません」と出たら「インタープリターの構成」→「ローカルインタープリターを追加」→「Virtualenv 環境」→「新規」で、場所を `プロジェクトフォルダ/venv` にして作成
   （通知が出ない場合は「ファイル」→「設定」→「プロジェクト: nisshi」→「Python インタープリター」から設定）
3. 「requirements.txt の依存関係をインストール」の通知が出たら「インストール」（出ない場合はターミナルで `pip install -r requirements.txt`）
4. 右上の実行構成で「app（http://127.0.0.1:5012/）」を選んで ▶ 実行
5. 実行ログに表示される講師用画面 `http://127.0.0.1:5012/admin` を開き、日別計画表PDFを登録する
   （手元では初回実行時に開発用パスワードが自動で作られます。中身は `PycharmProjects\nisshi-data\admin_password`）
6. `http://127.0.0.1:5012/` を開き、日付を選んで `sample_roster.txt` を読み込んで確認

### GitHub リポジトリにする

1. 「VCS」→「バージョン管理統合を有効にする」→ Git
   （メニューにこの項目が無い場合は、ターミナルで `git init -b main` を実行）
2. 「Git」→「コミット」で全ファイルをコミット（`.github` と `.idea` の設定ファイルも含める）
3. 「Git」→「GitHub」→「GitHub でプロジェクトを共有」でリポジトリを作成・プッシュ

プッシュ時点で自動デプロイが動くので、先に 2章・3章の設定を済ませておくとエラーになりません。

## 2. サーバーの初回設定（1回だけ）

`deploy/` フォルダのファイルは自動デプロイでは転送されません（サーバーの設定ファイルなので、手作業で1回だけ置きます）。

### 2-1. 手元のPCからファイルを送る（PyCharm のターミナル）

```powershell
scp deploy\nisshi.service deploy\sudoers_nisshi deploy\nginx_nisshi.conf home:~/
```

`home` は SSH 設定（`~\.ssh\config`）の Host 名です。設定が無い場合は次のように指定します。

```powershell
scp -i $HOME\.ssh\id_rsa_appuser deploy\nisshi.service deploy\sudoers_nisshi deploy\nginx_nisshi.conf appuser@telcation.f5.si:~/
```

### 2-2. サーバーで設定する（`ssh home` で接続）

```bash
# アプリ置き場と、登録データ・パスワードの置き場（デプロイで消えないよう別フォルダ）
mkdir -p ~/apps/nisshi
mkdir -p -m 700 ~/apps/nisshi-data

# 講師用画面のパスワード（自分で決めた文字列を1行で書いて保存）
nano ~/apps/nisshi-data/admin_password
chmod 600 ~/apps/nisshi-data/admin_password

# systemd
sudo cp ~/nisshi.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable nisshi

# 再起動の許可（GitHub Actions 用）。visudo -c で書式を確認してから置く
sudo visudo -c -f ~/sudoers_nisshi \
  && sudo install -m 440 -o root -g root ~/sudoers_nisshi /etc/sudoers.d/nisshi

# nginx：有効な設定ファイルは sites-enabled/telcation.conf（実ファイル）
#        ※ sites-available/telcation.conf は使われていない古いファイルなので編集しない
# (1) バックアップ（sites-enabled の中に置くと nginx が読み込んでしまうので、ホームに置く）
sudo cp /etc/nginx/sites-enabled/telcation.conf ~/telcation.conf.bak

# (2) 貼り付け位置を確認：namepicker の location の行番号を調べる
grep -n "location /namepicker/" /etc/nginx/sites-enabled/telcation.conf

# (3) その行番号を付けて開き、namepicker の location ブロック（閉じカッコ } まで）の
#     すぐ下に ~/nginx_nisshi.conf の内容を貼り付ける（例：行番号が 120 なら +120）
cat ~/nginx_nisshi.conf
sudo nano +<上で調べた行番号> /etc/nginx/sites-enabled/telcation.conf

# (4) 書式チェックして反映（エラーなら (1) のバックアップで戻す）
sudo nginx -t && sudo systemctl reload nginx
#   戻す場合：sudo cp ~/telcation.conf.bak /etc/nginx/sites-enabled/telcation.conf

# 送ったファイルの片付け
rm ~/nisshi.service ~/sudoers_nisshi ~/nginx_nisshi.conf ~/telcation.conf.bak
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
3. GitHub の「Actions」タブで「自宅サーバーへデプロイ（nisshi）」が緑になれば完了

## 注意点

- GitHub のサーバーから自宅へ SSH するため、SSH ポートを外部公開する必要があります。パスワード認証は無効にし、鍵認証のみにしてください。SSH を外部に開けたくない場合は、サーバーに **セルフホストランナー** を入れて `runs-on: self-hosted` に変える方法があります。
- 「ドキュメントフォルダを最初に開く」動作は Chrome / Edge かつ HTTPS のときだけ有効です。Firefox / Safari では通常のファイル選択画面になります。
