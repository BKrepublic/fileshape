# 後続工程：ブラウザー／Androidアダプター

## 位置付けと開始条件

この工程はCLI版の完成後に行う拡張で、工程1〜5の終了を遅らせるための追加条件ではありません。今回の依頼は指示書の作成・公開です。この文書だけでアプリの実装方式、サービス公開、ストア申請を決定したことにはしません。

開始時にCLI版の受け入れ記録を読み、最初の対象を「ブラウザー版」「Android版」のどちらにするか、対象OS／ブラウザー、配布方式、オフライン要件、最大入力の想定を整理します。既定の設計案はローカル処理で、ユーザーのPDFをサーバーへ送る方式へ勝手に変更しません。対象方式が未決なら、実装案と実測可能な比較を提示してその判断を受けてからUI実装へ進みます。

## 現在のcheckpoint

[Stage 26 byte-oriented conversion boundary](../stage26-byte-core-boundary.md) で、byte入力のinspection/conversion API、明示的なPDF.js resource config、Node CLIの一回読込、byte ownership、固定metadataでのpath/byte出力一致を実装しました。ローカル公開検証は202/202 testsとpinned EPUBCheck 5/5 integration testsに合格し、PR #19とmerge後の`main` CIも成功したためacceptedです。

[Stage 27 runtime module boundary](../stage27-runtime-module-boundary.md) ではinspection model、byte inspection core、byte conversion core、Node adapterを物理moduleとして分離し、[決定的なdependency inventory](../stage27-runtime-dependency-inventory.json) を追加しました。ローカル公開検証は205/205 tests、inventory verifier、pinned EPUBCheck 5/5 integration testsに合格し、PR #20とmerge後の`main` CIも成功したためacceptedです。

この時点でも変換runtimeはbrowser-readyではありません。inventoryはNode SHA-256、Node zlib deflate、Node由来のPDF.js資源provider、pinned legacy PDF.js importを明示しています。worker、進捗、キャンセル、診断、browser bundle、保存UI、large-file policyも未実装です。次checkpointは実測可能なbrowser fixtureでSHA-256、PNG deflate、PDF.js runtime/resource方式を選定します。

## 6A：共通コアと環境依存処理を分離する

1. [pdf-inspector.ts](../../src/pdf-inspector.ts)、[pdf-to-epub.ts](../../src/pdf-to-epub.ts)、validator、model／serializerのimportを調べ、Nodeのfs/path/crypto、PDF.js資源読み込み、Java、ファイル保存に依存する境界を一覧化します。`src/index.ts`等を完成した共通APIとみなさず、実際のexportと依存を確認します。
2. bytes入力、source identity、変換設定、EPUB bytes出力、進捗、キャンセル、診断を扱うAPIを設計します。sourceモデルと既存の保存性検証は共有し、UI用に別のパーサーを作り直しません。
3. CLIのファイル読み書きをadapterに移し、固定した入力bytesから同一のdocument IDを作ります。PDF.jsのfont/CMap等の資源は環境ごとに明示して供給します。
4. Java／EPUBCheckは開発・CIで生成物を検証する側に残します。利用者端末での通常変換にJavaを要求しません。
5. 分離前後のCLI出力を同一入力・設定で比較し、既存の全検証を実行します。UIへ進む前にこの段階をレビュー・pushします。

## 6B：ブラウザー版を作る場合

1. 対象ブラウザーでPDF.jsと必要資源を動かす最小fixtureを用意し、bundleへNode専用依存が混入していないことを確認します。
2. ファイル選択 → 設定 → 変換開始 → 進捗 → 保存、失敗時の再試行、キャンセルという操作を実装します。長い処理をUIスレッドから分離し、進捗の総量が不明な段階で架空の割合を表示しません。
3. サーバー送信を行わず、変換結果をユーザー操作で保存できることを実ブラウザーで確認します。object URL、worker、入力bytes、途中結果を完了／取消／失敗で解放します。
4. 自作PDFでsourceと出力をCLI版に照合します。次に実コーパスで実行し、完了する入力範囲とメモリ制約を測定します。大きなPDFで止まる場合は上限と説明を設け、9冊を未実行のまま対応済みとはしません。
5. 開発者ツールの通信記録で、PDF内容が外部へ送信されていないことを確認します。必要なアプリ資源の取得と入力データの送信を区別します。

## 6C：Android版を作る場合

1. WebView/PWAなど共通コアを使う方式と、ネイティブadapter方式を、実際のPDF.js動作・保存・キャンセル・メモリで比較し、採用方式を記録します。先にフレームワークだけを決めません。
2. OSのファイル選択／保存の仕組みを使用し、任意のローカルパスを読めると仮定しません。既存ファイルの上書きや不要な広い権限を避けます。
3. ファイル選択、設定、進捗、キャンセル、出力の保存／開く操作を実装します。画面回転、バックグラウンド移行、プロセス終了後に、壊れた出力を成功として見せないことを確認します。
4. 実機で小さなfixtureと代表的な大容量PDFを測定し、対応範囲の全入力で動作を確認します。シミュレーターだけなら実機確認は未実施と記録します。
5. 同じ入力・設定に対するCLIとの出力整合を検証し、生成EPUBを開発環境のEPUBCheckと実リーダーで確認します。

## 共通の検証と完了条件

- 共通コアの分離でCLIのsource所有・出力・検証結果に説明できない変更がない。
- 選んだ環境で実際に入力選択から出力保存まで操作できる。UIのスクリーンショットだけでは完了としない。
- キャンセル・エラー・再試行で状態や一時資源が破損せず、成功したファイルを別の処理で上書きしない。
- 同一入力／設定のCLIとアダプター出力が一致し、開発環境で規格検証に合格。違いが必要なら非意味的メタデータ等の差を明示する。
- 最大入力・処理時間・メモリを対象環境で実測し、対応範囲と未対応環境が明確。
- ローカル処理の方針と実際の通信・保存動作が一致している。

実機がない、必要なAPIが動かない、メモリ上限を超える場合は、該当環境の完了を保留します。バックエンドへ移す等の方式変更を黙って行いません。

成果物はadapter／UI、共通APIの契約、実操作の検証記録、性能と制限、CLI回帰結果、[レビュー記録](review-template.md) です。GitHubへの承認済みpushまでを通常の区切りとし、ホスティングやストア配布は具体的な成果物と配布先を確認して別途実行します。
