# 後続工程：ブラウザー／Androidアダプター

## 位置付けと開始条件

この工程はCLI版の完成後に行う拡張です。最初の対象はブラウザー版に決定済みで、ローカル処理・オフライン可能なPWAを先に成立させます。ユーザーのPDFをサーバーへ送る方式へ勝手に変更しません。Androidはブラウザー変換がend-to-endで成立し、共通コアのブラウザー制約が実測できるまで後回しです。

## 現在のcheckpoint

[Stage 26 byte-oriented conversion boundary](../stage26-byte-core-boundary.md) で、byte入力のinspection/conversion API、明示的なPDF.js resource config、Node CLIの一回読込、byte ownership、固定metadataでのpath/byte出力一致を実装しました。PR #19とmerge後の`main` CIまでacceptedです。

[Stage 27 runtime module boundary](../stage27-runtime-module-boundary.md) ではinspection model、byte inspection core、byte conversion core、Node adapterを物理moduleとして分離し、[決定的なdependency inventory](../stage27-runtime-dependency-inventory.json) を追加しました。PR #20とmerge後の`main` CIまでacceptedです。

[Stage 28 browser/PWA foundation](../stage28-browser-pwa-foundation.md) では、framework-freeのmobile-first PWA shell、relative-base対応service worker、browser conversion message contract、real PDF.js module worker probe、Vite/Playwright検証を実装しました。PR #21は`b5100164d95d623c7c8631e6ff265686f10320a3`としてmergeされ、PR CI #143と`main` CI #144が成功しています。

Stage 28はブラウザー変換そのものを完成扱いしていません。変換ボタンはdisabledのままです。Node SHA-256、Node zlib/PNG deflate、PDF.js conversion resource供給、real conversion worker、保存、実運用cancel/progress、browser corpus parity、対応ファイル上限は未完了です。

次checkpointはStage 29です。目的は「ブラウザーから共通conversion coreへ実際に到達し、公開fixture 1件をEPUBまで変換する」ことです。そのために必要なruntime portabilityとresource providerを先に解決します。

## 6A：共通コアと環境依存処理を分離する

Stage 26–27で基本分離はacceptedです。Stage 29以降では既存分離を崩さず、残った環境依存だけをinterface/providerへ押し出します。

1. `node:crypto`のSHA-256利用箇所を列挙し、同期／非同期の呼び出し契約を確認します。browser実装のためだけにsource identityやresource IDの意味を変えません。
2. `node:zlib`のPNG deflate利用箇所を列挙し、決定性・byte一致・圧縮レベルが既存検証に与える影響を測定します。browser側で別PNG表現になる場合は意味的同一性だけで済ませず、なぜbyte差が必要かを記録します。
3. PDF.jsのCMap、standard fonts、WASM/ICC等をNode path前提からproviderへ分離し、ブラウザーではbundle/static asset URLとして明示供給します。必要な資源だけをfixtureと実コーパスで実測します。
4. Java／EPUBCheckは引き続き開発・CI側の検証器です。利用者ブラウザーにJavaを要求しません。
5. CLI adapterとNode providerはaccepted behaviorを維持し、Stage 29変更後もCLI/private corpus回帰を必ず通します。

## Stage 29：ブラウザー変換の最小end-to-end

### 29A. runtime portability seam

- SHA-256とPNG deflateをenvironment-neutralなinterfaceへ切り出し、Node providerとbrowser providerを実装します。
- browser core graphから`node:` import、Node global shim、Node resource pathを除外します。
- browser providerをNodeでfakeしないで、Playwright Chromium内で実際に実行します。
- accepted CLI bytesが変わらないことを固定fixtureで検証します。変わる場合はStage 29をacceptedにしません。

### 29B. PDF.js browser resource provider

- `pdfjs-dist`のmodern browser buildとStage 28でacceptedになったreal Workerを継続利用します。
- CMap、standard-font、WASM/ICC等のresource URLをapplication base配下に固定し、same-originでのみ取得します。
- network testで外部CDNへのfallbackを禁止します。
- public fixtureで必要資源を実測し、未使用資源まで「対応済み」と書きません。

### 29C. dedicated conversion worker

- Stage 28の`start/accepted/progress/succeeded/cancelled/failed`契約を実装へ接続します。
- `start`のPDF `ArrayBuffer`はworkerへtransferし、main thread側の所有権を残しません。
- progressは実測phaseだけを出し、総量不明のphaseで架空percentを出しません。
- cancel後はsuccess/progressを禁止し、cleanup後に一度だけ`cancelled`を返します。
- 成功時はEPUB `ArrayBuffer`をmainへtransferします。workerはsingle-useで終了します。

### 29D. public fixture acceptance

- repositoryへ置ける自作／公開fixture PDFを1件使い、browser workerでPDF→EPUBを完走させます。
- 同じsource bytes・同じ明示optionsをNode byte APIへ渡し、document identity、ページ数、unresolved数、semantic content、package validationを比較します。
- deterministic metadataを固定できる条件ではEPUB bytes一致を最優先します。browser deflate等の正当なruntime差でbyte一致が不可能なら、ZIP entry内容を展開比較し、差を最小化・文書化します。
- 生成EPUBをCIのpinned EPUBCheckで検証します。

### 29E. UI接続

- end-to-end fixtureがgreenになるまで一般PDFの「EPUBに変換」ボタンを有効にしません。
- 接続後はファイル選択 → 設定 → 変換 → 進捗 → 保存を実装し、失敗・cancel・retryでobject URL、worker、input bytesを解放します。
- ダウンロード名はaccepted source-name ruleとCLI semanticsから導出し、ブラウザー独自のguessを追加しません。

## 6B：ブラウザー版の完了条件

1. 実ブラウザーでPDF.jsと必要資源が動作し、bundleへNode専用依存が混入していない。
2. ファイル選択 → 設定 → 変換開始 → 進捗 → 保存、失敗時の再試行、キャンセルが実動作する。
3. サーバー送信を行わず、変換結果をユーザー操作で保存できる。object URL、worker、入力bytes、途中結果を完了／取消／失敗で解放する。
4. 公開fixtureでCLI/byte APIとの意味的・可能ならbyte-level整合が証明され、EPUBCheckに合格する。
5. 次に9冊のprivate corpusをローカルブラウザーで実行し、5141 pagesを未実行のままbrowser parityと呼ばない。
6. private corpusでCLIと同じsource ownership、ruby unresolved preservation、outline、image/cover semantics、EPUB validationを比較する。
7. 実測した処理時間とpeak memoryから対応範囲を決める。大きなPDFで止まる場合は上限と説明を設けるが、根拠なしの固定MB制限を先に置かない。
8. 開発者ツールの通信記録で、PDF内容が外部へ送信されていないことを確認する。必要なapp resource取得とinput data送信を区別する。

## 6C：Android版を作る場合

Androidはbrowser end-to-end acceptance後に開始します。

1. accepted PWAをそのまま使う方式、WebView wrapper、ネイティブadapter方式を、PDF.js動作・保存・cancel・memoryで比較します。先にframeworkだけを決めません。
2. OSのファイル選択／保存の仕組みを使用し、任意のローカルpathを読めると仮定しません。既存ファイルの上書きや不要な広い権限を避けます。
3. ファイル選択、設定、進捗、キャンセル、出力の保存／開く操作を実装します。画面回転、background移行、process終了後に壊れた出力を成功として見せないことを確認します。
4. 実機で小さなfixtureと代表的な大容量PDFを測定し、対応範囲の全入力で動作を確認します。simulatorだけなら実機確認は未実施と記録します。
5. 同じ入力・設定に対するCLI/browser accepted pathとの出力整合を検証し、生成EPUBを開発環境のEPUBCheckと実readerで確認します。

## 共通の検証と完了条件

- 共通コアの分離でCLIのsource所有・出力・検証結果に説明できない変更がない。
- 選んだ環境で実際に入力選択から出力保存まで操作できる。UIのスクリーンショットだけでは完了としない。
- キャンセル・エラー・再試行で状態や一時資源が破損せず、成功したファイルを別の処理で上書きしない。
- 同一入力／設定のCLIとadapter出力が一致し、開発環境で規格検証に合格する。差が必要なら非意味的metadata等の差を明示する。
- 最大入力・処理時間・memoryを対象環境で実測し、対応範囲と未対応環境を明確にする。
- ローカル処理方針と実際の通信・保存動作が一致する。
- private corpus、生成private EPUB、local reportはcommitしない。

実機がない、必要なAPIが動かない、memory上限を超える場合は、該当環境の完了を保留します。backendへ移す等の方式変更を黙って行いません。

成果物はadapter／UI、共通API契約、実操作の検証記録、性能と制限、CLI回帰結果、[レビュー記録](review-template.md)です。ホスティングやstore配布は、browser変換acceptanceとは分離して扱います。
