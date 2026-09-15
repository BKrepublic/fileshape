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

## リワード広告について

EPUB保存そのものを「広告視聴の報酬」にする実装は行わない。

Googleのリワード広告ポリシーでは、報酬はサイト・アプリ内で利用される非金銭的なもので、譲渡可能なものにしないことが求められる。ダウンロード可能なEPUBはサイト外へ持ち出せるため、この用途への採用は避ける。

AdSense Offerwallのリワード広告を将来使う場合も、広告の長さをFileShape側で30秒・60秒などに固定する前提にはしない。配信される広告の長さはGoogle側の広告在庫による。

## Adsterra併用方針

AdSenseと併用する場合、PopunderなどGoogleのポリシーと衝突しやすい形式は使わない。まずAdSenseを優先し、必要なら通常のバナー・ネイティブ広告を別途検討する。

## 検証方針

GitHub Actions / hosted CIは使用しない。公開前のbuild、型検査、ブラウザ確認はFileShape既存ポリシーどおりユーザーPCのローカル環境で行う。
