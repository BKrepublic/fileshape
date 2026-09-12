# Codex handoff — 2026-09-12

この文書は、FileShape の次セッションを GitHub だけから再開するための短い入口です。実装詳細は `docs/remaining-work/README.md` と各 Stage 文書を参照してください。

## 開始点

この handoff 作成前の production `main` は次です。

```text
de07e5c2beda42ad8f2da296a36e637491589016
```

Stage 17 は `main` に merge 済みで、GitHub Actions の push CI も成功しています。作業開始時は必ず最新 `main` を取得し、`docs/continuation-status.md` の現在値と照合してください。

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

現在の優先作業は `docs/remaining-work/03-images-and-cover.md` の **production image integration** です。Stage 15〜17 の evidence gathering は current corpus について必要な地点まで完了し、Stage 18 で typed production image resource/occurrence 境界まで進みました。

実装の順序:

1. Stage 18 の typed resource/occurrence と fail-closed boundary を再読する。
2. body XHTML の source/geometry ordering に従って image occurrence を配置する。一意でない配置を推測で page末尾に置いて「保持済み」としない。
3. current corpus の `exact-rect + contains-image` を通常画像として EPUB へ同梱する。
4. PNG resource を OPF manifest に登録し、XHTML relative reference と archive path を決定的にする。
5. placement/package の end-to-end tests が通ってから production converter の `includeImages` を有効にする。
6. cropped / complex / unknown clip、mask、unsupported image schema は fixture で fail closed を維持する。現在 corpus に無いからと処理を削除しない。
7. cover は自動推測しない。通常の画像保持を先に完成させ、cover 指定は explicit policy / CLI として別 checkpoint にする。
8. production path を変えたら `npm test`、`npm run verify:epubcheck`、private 9-PDF full corpus を実行する。model/parser を変える場合は `npm run verify:ruby` と `npm run verify:stage2` も実行する。

## その後の道順

`docs/remaining-work/README.md` が CLI 版完成までの正本ロードマップです。現在の状態は概ね以下です。

1. headings/sections: source-backed evidence が得られず保留。Stage 12a page-level navigation が accepted fallback。
2. reading systems: CSS/resource implementation は Stage 14 で進んだが、実 reader acceptance は未完了。
3. images/cover: evidence/resource/clip 調査は Stage 15〜17 で進行済み。次は production image integration。cover はその後。
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
docs/codex-handoff-20260912.md、docs/continuation-status.md、docs/remaining-work/README.md、docs/remaining-work/03-images-and-cover.md、docs/stage15-image-evidence.md、docs/stage16-image-resources.md、docs/stage17-content-controls-image-placement.md を先に読む。
現在の最優先は production image integration。Stage 17 の private corpus result では 4/4 images が exact-rect + contains-image、marked-content occurrence は 0。source provenance と fail-closed policy を壊さず、bounded checkpoint ごとに実装・テスト・レビュー・pushする。
```
