# Codex handoff — 2026-09-12

この文書は、FileShape の次セッションを GitHub だけから再開するための短い入口です。実装詳細は `docs/remaining-work/README.md` と各 Stage 文書を参照してください。

## 開始点

**`main` から開始しないでください。** Stage 18 / Stage 19 は `codex-next-20260912` にあり、production `main` はまだそれ以前です。

正しい再開方法は次です。

```text
branch: codex-next-20260912
required Stage 19 implementation ancestor: 254b001aa6903ab18056b271d0b31d8c5154d2ca
```

作業時点の **最新 `codex-next-20260912` HEAD** を開始点とし、Stage 19 implementation commit `254b001aa6903ab18056b271d0b31d8c5154d2ca` の子孫であることを確認してください。handoff/review文書の更新でbranch HEAD自体はこのSHAより先へ進むため、`254b001`そのものへresetしてはいけません。

```sh
git switch codex-next-20260912
git pull --ff-only
git rev-parse HEAD
git merge-base --is-ancestor 254b001aa6903ab18056b271d0b31d8c5154d2ca HEAD
```

最後のコマンドが0でなければ作業を開始せず、remote branchを確認してください。

次に `docs/stage19-review.md`、`docs/continuation-status.md`、`docs/remaining-work/README.md` を確認します。

## 現在わかっていること

### ルビ

- exact ruby は `FileShapeDocument` の source provenance を保持したまま EPUB へ出力できる。
- `--ruby on|off` が実装済み。既定は `on`。
- `off` は exact ruby の `<rt>` を出さず、source-backed base text のみを出す。
- unresolved ruby は別系統。`--ruby off` でも黙って削除しない。
- unresolved annotation は既定では page note として保持し、strict error policy も残している。

### 画像

Stage 15〜17 で、9 PDF / 5,141 pages の private corpus を全件調査済み。

```text
IMAGE_PAINTS=4
IMAGE_RESOURCES=4 extracted / 0 unsupported
UNIQUE_CONTENT_RESOURCES=1
all resources: 800x600 RGB24
all four deterministic PNG contents are identical
CLIP_STATUS_COUNTS={"exact-rect":4}
CLIP_COVERAGE_COUNTS={"contains-image":4}
IMAGE_ISSUES=0
```

4 occurrence はすべて XObject。clip rectangle と transformed image bounds が一致し、実際の crop はありません。したがって、この corpus については pixel cropping を挟まず通常の EPUB image placement へ進めます。ただし generic implementation では cropped / complex / unknown clip を安全に扱う fixture と fail-closed policy を残してください。

Stage 19 implementation commit `254b001aa6903ab18056b271d0b31d8c5154d2ca` では `placementIndex`、ordered XHTML occurrence、content-hash PNG path、OPF manifest／ZIP entry、production limits、image-only/blank page区別、converterのatomic output置換まで実装済みです。164 tests、image model 9 PDF / 5,141 pages、ruby、Stage 2、4/4 real EPUBCheck integrationは合格しています。9 PDFのgenerated EPUBを使うfull regressionだけは中断点のため未実行です。

その後の独立レビューで、Stage 19をgeneric production acceptanceにする前に直すべき事項を `docs/stage19-review.md` に記録しました。特に、非等方scaleの縦横比、外部graphics stateのopacity/blend、画像同士の重なり、model clip/geometry cross-check、production limitの適用時点、full verifierの画像集計が対象です。

### marked content / 「特殊効果」

全 9 PDF / 5,141 pages の operator list を調査した結果:

```text
MARKED_OCCURRENCES=0
TAG_COUNTS={}
WRAPPER_TAG_COUNTS={}
POINT_TAG_COUNTS={}
MAX_MARKED_DEPTH=0
MARKED_ISSUES=0
```

したがって、**現在の private corpus に PDF marked-content tag 由来の特殊効果はありません**。Stage 17 の generic policy は維持しますが、現 corpus のためだけに特殊タグ変換規則を追加しないでください。

Generic policy:

- EPUB/XHTML/CSS で安全に表現できる presentation semantics は変換する。
- 表現不能な presentation-only wrapper は child content を保持して unwrap してよい。
- content-bearing / hidden / replacement / interactive / ambiguous effect を黙って削除しない。
- proprietary scripted behavior は既定で出力しない。

## 次にやること

Stage 19 の **private full EPUB regressionを先に回さない**でください。先に [Stage 19 review](stage19-review.md) のblockerを処理します。

順序:

1. `docs/stage19-review.md` と `docs/stage19-production-image-integration.md` を読む。
2. Review R1〜R4を修正し、focused fixture/testを追加する。
3. R5としてproduction per-resource limitsをPNG構築前にも適用する。
4. R6として `verify:epub` にprivacy-safeな画像集計を追加し、4 XHTML occurrences / 1 unique PNG / OPF / ZIP参照整合を検証できるようにする。
5. R7 interpolation evidence は current corpus 実測を含め、safe mapping / fail-closed / documented limitation のどれにするか明示する。
6. `npm test` と `npm run verify:epubcheck` を通す。
7. inspection/model境界を変えるため `npm run verify:image-model`、`npm run verify:ruby`、`npm run verify:stage2` を再実行する。
8. その後に初めて `npm run verify:epub -- --epubcheck --report-dir <NEW_LOCAL_REPORT_DIR>` を実行する。
9. 9/9 EPUB、5,141/5,141 pages、6,387 unresolved annotations、250/250 outline entries、4 image occurrences、1 unique PNG resource、XHTML/OPF/ZIP整合、EPUBCheck 9/9 zero warning/error を確認する。
10. 成功reportを再読込してStage 19 acceptedを記録後、local report/generated EPUBを削除する。
11. その後 explicit cover policy へ進む。coverは自動推測しない。

## その後の道順

`docs/remaining-work/README.md` が CLI 版完成までの正本ロードマップです。現在の状態は概ね以下です。

1. headings/sections: source-backed evidence が得られず保留。Stage 12a page-level navigation が accepted fallback。
2. reading systems: CSS/resource implementation は Stage 14 で進んだが、実 reader acceptance は未完了。
3. images/cover: Stage 19 production integration実装済みだがreview blocker修正と9 PDF full acceptanceが未完了。coverはその後。
4. unresolved ruby refinement: 6,387 unresolved annotations の改善は未完了。exact ruby on/off は Stage 17 で追加済みだが、これは Task 4 完了を意味しない。
5. CLI final acceptance: 上記を統合して実施。
6. browser/Android: CLI 完了後の別工程。

以前の runbook は「CLI版完成までの道のり」です。作成後のStage進捗は `docs/remaining-work/README.md` と `docs/continuation-status.md` の現在値を優先してください。

## 禁止事項

- verifier を弱めて PASS にしない。
- website / filename / URL / Creator / Producer / font name / N-code / character appearance 固有ルールを追加しない。
- source text/provenance を推測値で置換しない。
- unresolved ruby、unsupported image、unknown effect を件数を減らす目的で捨てない。
- private PDF、抽出画像、本文断片、local report を commit しない。
- Stage 19 review blockerを「current corpusではたまたま見えない」だけで完了扱いにしない。

## Codex 開始時の最小指示

```text
BKrepublic/fileshape の codex-next-20260912 の最新HEADから作業する。mainから開始しない。
254b001aa6903ab18056b271d0b31d8c5154d2ca がHEADのancestorであることを確認する。
docs/codex-handoff-20260912.md、docs/stage19-review.md、docs/continuation-status.md、docs/remaining-work/README.md、docs/remaining-work/03-images-and-cover.md、docs/stage19-production-image-integration.md を先に読む。
現在の最優先はStage 19 review blockerの修正。full 9-PDF EPUB regressionはその修正とverifierの画像集計追加後に実行し、Stage 19 acceptedを確定してからexplicit cover policyへ進む。
```