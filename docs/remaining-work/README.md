# FileShape 残作業の実行手順書

この手順書は、FileShape の **CLI版 PDF → EPUB を完成させるまでの正本ロードマップ**です。各個別文書が実装・検証・受け入れ条件の詳細を持ち、この README は順序・現在地・共通ルールを管理します。

2026-09-12 時点の基準は Stage 17 merge 後の `main`、`de07e5c2beda42ad8f2da296a36e637491589016` です。次セッションは [Codex handoff](../codex-handoff-20260912.md) と [continuation status](../continuation-status.md) を先に読んでください。

## 完成までの工程

| 順序 | 指示書 | 完成までに必要な内容 | 2026-09-12 現在 |
| --- | --- | --- | --- |
| 1 | [本文見出し・章構造](01-headings-and-sections.md) | PDF-native evidence があれば本文見出し/章境界へ反映 | **保留**。Stage 12b/13a で使える source-backed body anchor が 0。Stage 12a page-level nav を accepted fallback とする |
| 2 | [縦書き・ルビの表示互換性](02-reading-systems.md) | CSS、reading direction、実 reader での確認 | **検証中**。Stage 14 で packaged CSS / fixture / explicit page progression を実装済み。実 reader acceptance が未完了 |
| 3 | [表紙・挿絵](03-images-and-cover.md) | 画像資源、出現位置、EPUB同梱、明示的 cover policy | **実装中**。Stage 15-17 で evidence / decode / clip 判定まで完了。次は production image integration。cover はその後 |
| 4 | [未解決ルビの改善](04-ruby-refinement.md) | unresolved 6,387件の分類・改善・保存性確認 | **未完了**。Stage 17 の exact ruby on/off は追加済みだが、unresolved refinement とは別 |
| 5 | [CLI版の最終受け入れ](05-cli-acceptance.md) | 1〜4の accepted scope を統合し、CLIと既知制限を確定 | **未着手** |
| 後続 | [ブラウザー／Android](06-browser-android.md) | UI/環境依存adapter/実機 | **CLI完了後**。CLI完成条件には含めない |

工程番号を単純な進捗率へ換算しません。Task 1 のように source evidence が存在しない機能は `保留` のままにし、独立して進められる Task 2〜4 を止めません。

## 現在の重要な実測

### production baseline

```text
9 PDFs / 5141 pages / 9 EPUBs
EPUBCheck 5.3.0: 9/9 pass, 0 fatal / 0 error / 0 warning
unresolved annotations preserved: 6387
outline entries: 250 in 6 PDFs, unresolved destination 0
```

### heading/section evidence

Stage 13a:

```text
outline entries: 250
unique-position: 0
ambiguous-position: 0
page-only: 250
unmappable: 0
```

したがって title/body string matching、nearest text、outline depth から heading を推測してはいけません。

### image evidence

Stage 15〜17 の private full corpus:

```text
IMAGE_PAINTS=4
XOBJECT_PAINTS=4
EXTRACTED_RESOURCES=4
UNSUPPORTED_RESOURCES=0
UNIQUE_CONTENT_RESOURCES=1
all four: 800x600 RGB24
CLIP_STATUS_COUNTS={"exact-rect":4}
CLIP_COVERAGE_COUNTS={"contains-image":4}
IMAGE_ISSUES=0
```

4 occurrence は保持し、同一 content bytes の resource だけを dedupe します。現在 corpus の clip は実画像を切っていないため crop 不要です。

### marked content / 特殊効果

全 5,141 pages:

```text
MARKED_OCCURRENCES=0
TAG_COUNTS={}
WRAPPER_TAG_COUNTS={}
POINT_TAG_COUNTS={}
MAX_MARKED_DEPTH=0
MARKED_ISSUES=0
```

現在 corpus のための特殊タグ処理は不要です。ただし future input 向けの safe-normalization policy は維持します。unknown content subtree をタグ名だけで削除しません。

### ruby

- exact ruby: source-backed。
- CLI `--ruby on|off` 実装済み。既定 `on`。
- `off` は exact annotation markup のみを外し、base text と provenance を保持。
- unresolved ruby は別 policy で、`off` でも黙って捨てない。

## 次の実装 checkpoint

現在の最優先は **Task 3 production image integration** です。

1. Stage 15〜17 の image adapter/resource/clip evidence を読み直す。
2. image content resource と image occurrence provenance を分離した typed representation を追加する。
3. current corpus の `exact-rect + contains-image` occurrence を通常の reflowable EPUB image として同梱する。
4. body XHTML の source/geometry ordering に基づいて occurrence を配置する。位置が一意でない場合は推測で page末尾へ送らない。
5. PNG resource を deterministic path で ZIP に入れ、OPF manifest と XHTML relative reference を一致させる。
6. cropped / complex / unknown clip、mask、unsupported schema は synthetic fixture で fail closed を維持する。
7. cover を自動推測しない。通常 image preservation を先に完成させ、explicit cover policy を別 checkpoint で実装する。
8. production path 変更後に full validation を行う。

詳細は [工程3](03-images-and-cover.md) と [Codex handoff](../codex-handoff-20260912.md) を参照。

## 共通準備

1. repository root と作業環境の `AGENTS.md` / project instructions を読む。以前のホスト固有パスや認証方法を別環境へ推測で持ち込まない。
2. 未コミット変更を確認してから fast-forward のみで同期する。自動 `reset --hard`、stash、rebase、force push はしない。

```sh
git status --short --branch
git fetch origin
git pull --ff-only
git rev-parse HEAD
```

3. [continuation status](../continuation-status.md)、対象 task、直前 Stage 文書、変更予定コードを読む。
4. private full corpus を使う場合は `local-samples/` が 9 PDF / 5,141 pages の同一 corpus であることを確認する。private PDFs や抽出物を commit しない。
5. dependency/validator は lockfile と CI に合わせる。通常 conversion に Java を必須化しない。

## 全工程で守る条件

- website、filename、URL、Creator/Producer、font name、N-code、特定文字の見た目を parser branch 条件にしない。
- PDF structure、geometry、ordering、source refs を根拠にする。
- `TextItem.str` と source ownership を source truth として保持する。
- ligature、supplementary Unicode、combining sequence を推測幅で分割しない。
- uncertain ruby / heading / image placement / effect / cover を推測で確定しない。
- unresolved / unsupported 件数を減らすために情報を捨てない。
- verifier の期待値を弱めて PASS にしない。
- PDF.js internal schema を使う場合は pinned version の専用 adapter に閉じ込め、runtime shape を検証する。
- private PDF、private image、本文抜粋、generated private EPUB、local report を Git に入れない。

## 変更種別ごとの検証

| 変更 | 必須検証 |
| --- | --- |
| docs only | diff/link/command validation。private full conversion は不要 |
| 独立 inventory/evidence tool | `npm test` + positive/negative fixtures + full対象件数照合 |
| XHTML/CSS/EPUB package | `npm test` + `npm run verify:epubcheck` + 9-PDF full EPUB validation |
| parser/model/ruby/source ownership | 上記 + `npm run verify:ruby` + `npm run verify:stage2` |

典型的な full validation:

```sh
npm test
npm run verify:ruby
npm run verify:stage2
npm run verify:epubcheck
npm run verify:epub -- --epubcheck --report-dir <NEW_LOCAL_REPORT_DIR>
```

`verify:stage2` は semantic verification を含みます。レポート保存先は新規 path を使い、古い evidence を上書きしません。

## 工程を閉じる条件

各 checkpoint で以下を明示します。

- start SHA / end SHA
- 変更した契約と変更していない契約
- 実行した test / verifier と exit code
- private corpus の aggregate だけを公開し、private source は公開しない
- 未実施、保留、既知制限
- GitHub Actions の結果
- `docs/continuation-status.md` とこの status table の更新

「調査用コードを push した」「fixture が PASS した」「production feature が accepted になった」は別物として報告してください。

## この手順書は完成までの道のりか

**CLI版については Yes です。** Task 1〜5 が完成までの道筋で、Task 6 はその後の browser/Android 製品化工程です。

ただし、この runbook は最初に Stage 12 時点で作られたため、個別 task の初期記述には古い現状説明が残る場合があります。現在地の正本は常にこの README、`docs/continuation-status.md`、最新 Stage 文書です。Task 文書の未実装手順・完了条件そのものは引き続き有効ですが、Stage 13〜17 で完了した evidence gathering を最初からやり直さないでください。
