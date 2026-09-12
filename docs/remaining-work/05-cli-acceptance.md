# 工程5：CLI版の最終受け入れ

## 現在地

**自動受け入れは完了済みです。** Stage 25 private acceptance は branch HEAD `fcc4dff39e5ce6e1c10e5cf2568be8afbe6fafbd` で全項目PASSし、accepted merge commit `3f5a3754c6ec084a359ac9967c99e60a7f145e90` として `main` に統合済みです。そのmerge commitのmain push CIも成功しています。

今回のproduction変更はCLI境界だけです。

- `inputPath === outputPath` を変換前に拒否する。
- `--help` / `-h` を追加する。
- 実装済み全オプションをusageへ列挙する。
- parserをpublic contract testから検証可能にする。
- 既存のatomic output replacementを維持する。

PDF抽出、ruby association、画像配置、navigation、EPUB serializationの判定規則は変更していません。

## 5A：受け入れ対象

CLIの完成範囲:

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

## 5B：CLI境界と実コマンド

Public testで全実装オプション、unknown/missing/invalid option、usage、source PDF自身をoutputに指定した場合の拒否を固定済みです。

Private real-CLI acceptance:

```text
CLI_ACCEPTANCE=PASS
PDFS=9
SELECTED_PDF_ID=sha256:c498e2c0069aabd2
SELECTED_PAGES=46
SELECTED_UNRESOLVED=3
DEFAULT_BYTES=128957
DETERMINISTIC_BYTES=yes
STRICT_REJECTED=yes
FAILED_OUTPUT_PRESERVED=yes
INVALID_OPTION_REJECTED=yes
MISSING_INPUT_REJECTED=yes
HELP_SUCCEEDED=yes
DOCUMENTED_OPTIONS_SUCCEEDED=yes
ELAPSED_MS=25509
```

再現コマンド:

```sh
mkdir -p local-reports
npm run verify:cli -- local-samples \
  --report local-reports/cli-acceptance-NEW.json \
  --expect-pdf-count 9
```

## 5C：統合private regression

同一HEADで以下をPASS済みです。

```text
RUBY_EXIT=0
STAGE2_EXIT=0
COVER_EXIT=0
VERIFY_EPUB_EXIT=0
PDFs: 9/9
EPUBs: 9/9
Pages: 5141/5141
Unresolved annotations preserved: 6387
Total EPUB bytes: 17959256
Outline entries: 250/250; outline PDFs: 6/6; unresolved outline entries: 0
Image occurrences: 4/4; unique PNG content resources: 1/1; XHTML/OPF/ZIP references: consistent
EPUBCheck 5.3.0: 9/9 passed (0 errors, 0 warnings)
```

cover smokeも同一コードでPASS:

```text
COVER_SMOKE=PASS
BODY_IMAGE_OCCURRENCES=1
PNG_RESOURCES=1
COVER_MARKERS=1
BODY_OCCURRENCES_PRESERVED=yes
PNG_RESOURCES_UNCHANGED=yes
EPUBCheck 5.3.0: pass (0 errors, 0 warnings)
```

## 5D：利用者向け契約

READMEには以下を実装どおり記載済みです。

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

Thorium/calibreの実reader確認は環境依存の別項目です。**現時点では未実施**です。

CLI自動受け入れとmanual reader受け入れは証拠を分離します。EPUBCheck greenをmanual reader PASSとして扱いません。

## 完了判定

| 必須項目 | 結果 |
| --- | --- |
| CLI | PASS。default / strict / options / invalid input / help / determinismを実コマンドで検証済み |
| 保存性 | PASS。9冊・5,141ページ、6,387 unresolved、outline、画像資源baseline維持 |
| 規格 | PASS。EPUBCheck 5.3.0が9/9、error/warning 0 |
| 安全性 | PASS。source path破壊なし。失敗時に既存outputを変更しない |
| 利用方法 | PASS。READMEとactual CLI option surface一致 |
| 公開 | PASS。Stage 25をmainへmerge済み。accepted merge commitのmain push CI成功 |
| 読書 | 未実施。Thorium/calibreは別項目として残す |

自動CLI checkpointは完了です。次はmanual reader確認を必要に応じて実施し、[工程6：browser/Android](06-browser-android.md) へ進みます。
