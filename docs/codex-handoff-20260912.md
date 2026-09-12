# Codex handoff — 2026-09-12

この文書は、FileShape の次セッションを GitHub だけから再開するための短い入口です。実装詳細は `docs/remaining-work/README.md` と各 Stage 文書を参照してください。

## 開始点

Stage 19 の開始点は、GitHubへpush済みの次のbranch checkpointです。

```text
branch: codex-next-20260912
commit: f3776ba5c6558794daff98cbb6523351913b0c06
```

Stage 19 implementation checkpoint は同じbranchへ、このhandoffを含むcommitとしてpushされています。作業開始時はbranchのlocal／tracking／remote SHAを照合し、`docs/continuation-status.md` の現在値を確認してください。

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

Stage 19 では `placementIndex`、ordered XHTML occurrence、content-hash PNG path、OPF manifest／ZIP entry、production limits、image-only/blank page区別、converterのatomic output置換まで実装済みです。164 tests、image model 9 PDF / 5,141 pages、ruby、Stage 2、4/4 real EPUBCheck integrationは合格しています。9 PDFのgenerated EPUBを使うfull regressionだけは中断点のため未実行です。

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

現在の優先作業は Stage 19 の **private full EPUB acceptance** です。production image integration の実装は完了しています。

実装の順序:

1. `docs/stage19-production-image-integration.md` とreview済みStage 19 contractを読む。
2. `npm run verify:epub -- --epubcheck --report-dir <NEW_LOCAL_REPORT_DIR>` を実行する。
3. 9/9 EPUB、5,141/5,141 pages、6,387 unresolved annotations、250/250 outline entriesの既存baselineを確認する。
4. report/archive検査で4 image occurrences、1 unique PNG resource、全XHTML reference／OPF manifest／ZIP entry整合を確認する。verifierがまだこの集計を出さない場合は、private本文やfilenameを出さない集計検証を追加してから再実行する。
5. 成功reportを再読込後にlocal report/generated EPUBを削除する。
6. Stage 19をacceptedにした後、explicit cover policyへ進む。coverは自動推測しない。

## その後の道順

`docs/remaining-work/README.md` が CLI 版完成までの正本ロードマップです。現在の状態は概ね以下です。

1. headings/sections: source-backed evidence が得られず保留。Stage 12a page-level navigation が accepted fallback。
2. reading systems: CSS/resource implementation は Stage 14 で進んだが、実 reader acceptance は未完了。
3. images/cover: Stage 19 production integration実装済み。9 PDF full acceptance未実行。coverはその後。
4. unresolved ruby refinement: 6,387 unresolved annotations の改善は未完了。exact ruby on/off は Stage 17 で追加済みだが、これは Task 4 完了を意味しない。
5. CLI final acceptance: 上記を統合して実施。
6. browser/Android: CLI 完了後の別工程。

つまり、以前の runbook は「完成までの道のり」と考えてよいですが、作成時点が古く、Stage 13〜17 で消化された部分を現在値で読み替える必要があります。`docs/remaining-work/README.md` と `docs/continuation-status.md` を今回更新し、以後はそこを正本にしてください。

## 禁止事項

- verifier を弱めて PASS にしない。
- website / filename / URL / Creator / Producer / font name / N-code / character appearance 固有ルールを追加しない。
- source text/provenance を推測値で置換しない。
- unresolved ruby、unsupported image、unknown effect を件数を減らす目的で捨てない。
- private PDF、抽出画像、本文断片、local report を commit しない。

## Codex 開始時の最小指示

```text
BKrepublic/fileshape の最新 main から作業する。
docs/codex-handoff-20260912.md、docs/continuation-status.md、docs/remaining-work/README.md、docs/remaining-work/03-images-and-cover.md、docs/stage19-production-image-integration.md を先に読む。
現在の最優先は Stage 19 private full EPUB acceptance。実装と164 tests、image model、ruby、Stage 2、4件のreal EPUBCheck integrationは合格済み。未実行の9 PDF full EPUB regressionを新規local reportで行い、4 occurrences／1 PNG resourceを検証してからexplicit cover policyへ進む。
```
