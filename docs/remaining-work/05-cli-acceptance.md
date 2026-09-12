# 工程5：CLI版の最終受け入れ

## 現在地

Task 4まで受け入れ済み。Stage 25でCLIの最終受け入れに入っています。

今回のproduction変更はCLI境界だけです。

- `inputPath === outputPath` を変換前に拒否する。
- `--help` / `-h` を追加する。
- 実装済み全オプションをusageへ列挙する。
- parserをpublic contract testから検証可能にする。
- 既存のatomic output replacementを維持する。

PDF抽出、ruby association、画像配置、navigation、EPUB serializationの判定規則は変更しません。

## 5A：受け入れ対象を固定する

CLIの完成範囲は以下です。

- PDF -> EPUB変換。
- source-backedな本文、exact ruby、unresolved annotation保存。
- explicit PDF outline navigation。source-backed headingがない場合はpage navigation fallback。
- production image preservationとexplicit cover designation。
- official EPUBCheck 5.3.0 clean。
- `--ruby on|off`、`--unresolved-ruby`、metadata、page progression、cover occurrence等の実装済みオプション。

完成条件に含めないもの:

- OCR。
- 任意PDFへの完全対応。
- automatic cover inference。
- browser/Android UI。
- 未実施のThorium/calibre確認を自動PASS扱いすること。

## 5B：CLI境界と実コマンドを検証する

Public testでは次を固定します。

- 全実装オプションのparse。
- unknown/missing/invalid optionの拒否。
- usageの完全性。
- source PDF自身をoutputに指定した場合の拒否。

Private corpusでは `npm run verify:cli` を使います。

```sh
mkdir -p local-reports
npm run verify:cli -- local-samples \
  --report local-reports/cli-acceptance-NEW.json \
  --expect-pdf-count 9
```

このverifierはprivate本文やfilenameをreportへ書かず、実CLIを以下の経路で実行します。

1. unresolved rubyを含むPDFを構造的に選ぶ。
2. default conversionを固定`--modified`で2回実行し、byte-identicalか確認する。
3. `--unresolved-ruby error`が非0終了し、新規outputを残さないことを確認する。
4. strict failureが既存outputを変更しないことを確認する。
5. unknown optionを拒否し、outputを残さないことを確認する。
6. missing inputでusageを返すことを確認する。
7. `--help`が成功することを確認する。
8. metadata、ruby off、explicit unresolved policy、rtl page progression等のdocumented option surfaceを実CLIで成功させる。
9. scratch EPUBを終了時に削除する。

coverはStage 20の `npm run verify:cover` でsource occurrence -> cover-image marker -> body occurrence preservation -> EPUBCheckまで別途検証します。

## 5C：統合private regression

Stage 25の同一HEADで最低限以下を実行します。

```sh
npm run verify:cli -- local-samples --report local-reports/cli-NEW.json --expect-pdf-count 9
npm run verify:ruby
npm run verify:stage2
npm run verify:cover
npm run verify:epub -- --epubcheck --report-dir local-reports/epub-NEW
```

継承する必須値:

```text
PDFs: 9/9
EPUBs: 9/9
Pages: 5141/5141
Unresolved annotations preserved: 6387
Outline entries: 250/250
Image occurrences: 4/4
Unique PNG content resources: 1/1
EPUBCheck 5.3.0: 9/9 passed (0 errors, 0 warnings)
```

Stage 25でproduction文書変換規則は変えていないため、これらの値が説明なく変わった場合は受け入れず原因を調べます。

## 5D：利用者向け契約

READMEには以下を実装どおり記載します。

- `npm ci` と基本変換コマンド。
- 全実装オプション。
- ruby ON/OFFの意味。
- unresolved rubyのdefault preserveとstrict error。
- output未指定時の場所。
- source pathへの上書き禁止。
- successful conversionはrequested outputをatomic replacementし得ること。
- failure時は既存outputを変更しないこと。
- fixed `--modified`がbyte determinismに必要なこと。
- OCRなし、automatic coverなし、unsupported inputはfail closedであること。

## manual reader acceptance

Thorium/calibreの実reader確認は環境依存の別項目です。未実施なら「未実施」と記録し、EPUBCheck greenから表示合格を推定しません。

CLI自動受け入れとmanual reader受け入れは証拠を分離します。manual reader未実施を理由にproduction regressionの結果を曖昧にもしません。

## 完了判定

| 必須項目 | 受け入れ条件 |
| --- | --- |
| CLI | default / strict / options / invalid input / help / determinismが実コマンドで期待どおり |
| 保存性 | 9冊・5,141ページ、6,387 unresolved、outline、画像資源の既存baselineを維持 |
| 規格 | EPUBCheck 5.3.0が9/9、error/warning 0 |
| 安全性 | source path破壊なし。失敗時に既存outputを変更しない |
| 利用方法 | READMEとactual CLI option surfaceが一致 |
| 公開 | 対象SHAのpublic CI成功、private acceptance記録、noreply commit |
| 読書 | Thorium/calibre未実施なら未実施と明記。実施した場合のみ合格記録を付ける |

完了後はCLI checkpointを固定し、[工程6：browser/Android](06-browser-android.md)へ進みます。
