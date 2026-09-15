# FileShape 広告・検索公開チェック

更新: 2026-09-15

## 実装済み

- トップページ下部にFileShapeの説明、使い方、対応PDF、FAQ、ガイド導線を追加。
- トップページの検索向けdescriptionを追加。
- EPUB保存リンクを独立した大きいボタンへ変更。
- プライバシーポリシーを広告配信、Cookie、IPアドレス等の利用を含む内容へ更新。
- 広告・アフィリエイトポリシーを更新。
- `robots.txt` を追加。検索・検索連携は許可し、学習用途のクローラーには実行コード・バイナリ資産の巡回を拒否。
- `sitemap.xml` を追加。
- EPUB利用ガイド8本を追加。
- Cloudflare Pages Functions用middlewareを追加。公開HTMLでは静的CSP metaを外し、リクエストごとのnonceを使ったstrict CSPをレスポンスヘッダーで設定する。
- `ADSENSE_CLIENT_ID` が正しい `ca-pub-...` 形式で設定された場合のみ、トップページとガイドページへAdSenseタグを挿入する。

## AdSenseアカウント取得後に行う外部設定

### 1. Publisher IDをCloudflareへ設定

Cloudflare PagesのProduction環境変数に次を設定する。

`ADSENSE_CLIENT_ID=ca-pub-xxxxxxxxxxxxxxxx`

値が未設定または形式不正の場合、広告タグは挿入されない。

### 2. 欧州等の同意画面

AdSenseの「プライバシーとメッセージ」からEuropean regulations messageを作成する。

方針:

- 対象: EEA、英国、スイスなどGoogleの対象地域。
- 3択表示を使用する。
  - 同意しない
  - 設定する
  - 同意する
- 日本向け通常アクセスにはこの欧州向けメッセージを常時表示しない。
- Google認定CMPを利用し、独自Cookie同意UIで代用しない。

### 3. Search Console

Google Search Consoleで `fileshape.isjust.fyi` を登録・所有確認する。

登録後に以下を送信する。

`https://fileshape.isjust.fyi/sitemap.xml`

トップ、ガイド一覧、主要ガイドのインデックス状況を確認する。

### 4. AdSense審査

サイトが公開され、以下を確認してから審査へ進む。

- `/robots.txt` が取得できる。
- `/sitemap.xml` が取得できる。
- プライバシー、広告方針、利用規約、運営情報、問い合わせが公開されている。
- トップ下部の説明とガイドが公開されている。
- 広告タグがCSPでブロックされていない。
- ダウンロード操作と広告を誤認させる配置になっていない。

## 1広告 = 1変換のリワード広告

### 結論

「広告を視聴するとPDF→EPUB変換を1回利用できる」という設計は、Google Ad ManagerのWeb向けリワード広告で実装候補にできる。

AdSense Offerwallは主にページビュー数または時間単位のサイトコンテンツアクセス権を付与する仕組みであり、変換処理1回だけを直接アンロックする用途には向かない。

Google Ad ManagerのWeb向けリワード広告では、Google Publisher Tagの `rewardedSlotGranted` イベントを受けて、パブリッシャー側が任意の報酬を付与できる。FileShapeでは報酬を「変換処理を1回開始できる権利」とし、EPUBファイルそのものを報酬として扱わない。

想定フロー:

1. PDFを選択する。
2. 「広告を視聴してEPUBに変換」を押す。
3. リワード広告が利用可能なら、広告視聴への明示的な同意を得て表示する。
4. `rewardedSlotGranted` が発火したら、その変換要求に1回分の変換許可を記録する。
5. 広告が閉じられた後、許可済みなら変換を1回だけ開始する。
6. 変換許可は消費して再利用しない。

途中で広告を閉じた場合や報酬付与イベントが発生しなかった場合は、変換権を付与しない。

広告在庫がなくリワード広告を表示できない場合にサービス自体が永久に利用不能にならないよう、無料変換へのフォールバック等を別途決める。

Web向けリワード広告では、広告の長さをFileShape側で30秒・60秒などに固定する前提にはしない。広告の形式や完了条件は配信された広告により異なる。

### 人間が行うGoogle Ad Manager側の作業

- 有効なAdSenseアカウントを用意する。
- そのAdSenseアカウントを使ってGoogle Ad Managerへ申し込む。
- Web向けリワード広告用の広告ユニットを作成する。
- 必要な広告申込情報・Google需要を設定する。
- Web向けリワード広告に必要な保護設定を確認する。
- 発行されたネットワークコードと広告ユニットパスをFileShape側の設定に渡す。

この情報が確定するまでは、リワード広告の本番コードを固定値で実装しない。

## Adsterra併用方針

AdSense / Ad Managerと併用する場合、PopunderなどGoogleのポリシーと衝突しやすい形式は使わない。まずGoogle系広告を優先し、必要なら通常のバナー・ネイティブ広告を別途検討する。

## ローカル検証

GitHub Actions / hosted CIは使用しない。公開前のbuild、型検査、ブラウザ確認はFileShape既存ポリシーどおりユーザーPCのローカル環境で行う。

現在の標準公開検証:

```sh
npm test
npm run verify:runtime-deps
env PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome-stable npm run verify:browser
npm run setup:epubcheck
npm run verify:epubcheck
git diff --check
```

今回のPRでは変換エンジン本体を変更していないため、まずこの公開検証を必須とする。加えてブラウザでトップページ、ガイド一覧、追加した8記事、プライバシー、広告方針、EPUB保存ボタンの表示を目視確認する。
