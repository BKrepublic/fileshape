# FileShape 残作業の実行手順書

この文書は FileShape の **CLI版 PDF -> EPUB を完成させるまでの正本ロードマップ**です。詳細な実装・検証・受け入れ条件は各 task 文書と最新 Stage 文書を優先します。

## 現在地

2026-09-12、Stage 19 production image integration は independent review の hardening と private 9-PDF acceptance まで完了し、**通常画像 preservation は accepted** です。Stage 20 explicit cover policy は実装とpublic CI、private default full regressionまで完了し、explicit-cover private smokeだけが残っています。

Stage 19/20 default private acceptance:

```text
PDFs: 9/9
EPUBs: 9/9
Pages: 5141/5141
Unresolved annotations preserved: 6387
Outline entries: 250/250
Image occurrences: 4/4
Unique PNG content resources: 1/1
Interpolated image occurrences: 0
XHTML/OPF/ZIP references: consistent
EPUBCheck 5.3.0: 9/9 passed (0 errors, 0 warnings)
```

Stage 20 default output total bytes remain 17,959,256, matching the accepted Stage 19 full regression.

## 完成までの工程

| 順序 | 指示書 | 残っている内容 | 現在 |
| --- | --- | --- | --- |
| 1 | [本文見出し・章構造](01-headings-and-sections.md) | 新しいPDF-native evidenceが得られた場合だけ再開 | **保留**。Stage 13aで source-backed body anchor 0。page-level navigationをaccepted fallbackとする |
| 2 | [縦書き・ルビの表示互換性](02-reading-systems.md) | 実readerでの互換性確認 | **実装済み・manual acceptance待ち** |
| 3 | [表紙・挿絵](03-images-and-cover.md) | Stage 20 explicit-cover private smoke | **通常画像 accepted。cover実装済み、最終smoke待ち** |
| 4 | [未解決ルビの改善](04-ruby-refinement.md) | unresolved 6387件の分類・改善・保存性確認 | **未完了** |
| 5 | [CLI版の最終受け入れ](05-cli-acceptance.md) | accepted scope統合、CLI/既知制限の凍結、最終validation | **未着手** |
| 後続 | [ブラウザー／Android](06-browser-android.md) | UI/環境adapter/実機 | **CLI完了後** |

Task 1 のように source evidence が存在しない機能は推測で埋めません。独立して進められる Task 2〜4 を止めないでください。

## Task 3 の現在の契約

Stage 15〜17 の evidence:

```text
9 PDFs / 5141 pages
4 XObject image occurrences
4 decoded resources across source PDFs
1 unique PNG content resource
800x600 RGB24
all clips: exact-rect / contains-image
marked-content occurrences: 0
```

Stage 18/19 で以下が accepted です。

- resource bytes と occurrence provenance を分離して保持;
- content hashでPNG bytesだけをdedupeし、occurrenceを消さない;
- geometry-backed text/image placement;
- image-only page と blank page の区別;
- deterministic XHTML/OPF/ZIP resource/reference;
- non-uniform scaling、unsupported compositing、layered overlap、invalid clip/transform、unsupported interpolationをfail closed;
- production limitsのpreflight/final validation;
- full verifierによる XHTML occurrence / OPF image item / PNG ZIP entry / reference整合確認。

Stage 20 で explicit cover policy を追加済みです。

Cover rules:

- 既定で自動推測しない;
- CLIは `--cover-occurrence PAGE:OPERATOR:OCCURRENCE`;
- page number、画像寸法、位置、filename、appearance、contentから表紙を推測しない;
- exact source occurrence だけを指定し、存在しない/曖昧な指定はfail closed;
- source-backed cover metadataが無く、user指定も無い入力はcover未指定のまま成功する;
- cover指定しても元の本文image occurrenceを削除しない;
- selected existing manifest itemだけに EPUB `properties="cover-image"` を付ける;
- synthetic cover XHTML/spine itemは追加しない;
- shared image resourceはcover指定後もdedupeを維持する。

Public CIとprivate default 9-PDF regressionはpass済みです。Task 3を閉じる前に `npm run verify:cover` を実行し、one cover marker / unchanged body occurrences / unchanged PNG resources / EPUBCheck clean を確認します。

## Ruby

- exact rubyはsource-backed;
- `--ruby on|off` 実装済み、既定`on`;
- `off`はexact annotation markupだけを外し、base text/provenanceを保持;
- unresolved rubyは別policyで、`off`でも捨てない;
- private full corpusのunresolved countは6387。

## Heading/navigation

Stage 13aの全250 outline entriesはすべてpage-level evidenceでした。

```text
unique-position: 0
ambiguous-position: 0
page-only: 250
unmappable: 0
```

したがって title/body string matching、nearest text、outline depth、font name、appearanceからbody headingを推測してはいけません。

## 共通ルール

- website、filename、URL、Creator/Producer、font name、N-code、特定文字の見た目をparser branch条件にしない;
- PDF structure、geometry、ordering、source refsを根拠にする;
- `TextItem.str` と source ownershipをsource truthとして保持する;
- ligature、supplementary Unicode、combining sequenceを推測幅で分割しない;
- uncertain ruby / heading / image effect / coverを推測で確定しない;
- unresolved / unsupported件数を減らすために情報を捨てない;
- verifierの期待値を弱めてPASSにしない;
- PDF.js internal schemaはpinned adapterへ隔離しruntime shapeを検証する;
- private PDF、private image、本文抜粋、generated private EPUB、local reportをGitへ入れない。

## 検証

通常development:

```sh
npm test
```

XHTML/CSS/EPUB package変更:

```sh
npm test
npm run verify:epubcheck
```

parser/model/source ownership変更時は追加:

```sh
npm run verify:image-model -- local-samples --expect-pdf-count 9 --expect-page-count 5141 --expect-image-occurrence-count 4 --expect-unique-content-resource-count 1 --expect-interpolated-image-occurrence-count 0
npm run verify:ruby
npm run verify:stage2
```

private full acceptance:

```sh
npm run verify:epub -- --epubcheck --report-dir <NEW_LOCAL_REPORT_DIR>
```

Stage 20 explicit-cover smoke:

```sh
npm run verify:cover
```

## 工程を閉じる条件

各checkpointで以下を残します。

- start SHA / end SHA;
- 変更したcontractと変更していないcontract;
- test / verifier とexit code;
- private corpusはaggregateだけ記録;
- 未実施、保留、既知制限;
- GitHub Actions結果;
- `docs/continuation-status.md` とこのstatus更新。

「fixtureがPASS」「production implementationが入った」「private corpus acceptance済み」は別状態として扱います。

## この手順書は完成までの道のりか

**CLI版については Yes** です。Task 1〜5がCLI完成までの道筋で、Task 6はその後のbrowser/Android製品化です。現在地はこのREADME、`docs/continuation-status.md`、最新Stage/review文書を優先してください。
