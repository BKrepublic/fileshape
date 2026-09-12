# Stage 19 production image integration

2026-09-12 の Stage 19 checkpoint は、レビュー済み設計 `03-images-and-cover.md` の SHA-256 `1b8afa21d7142f82bc918953abec88f205c8913862e8263fb6a7789bd4de5a64` に従って本文画像を production EPUB 経路へ接続した。

- `placementIndex` は既存の `PhysicalPageLayout` の全 unit position、semantic block の `unitIndexes`、画像の display bounds だけから算出する。epsilon は `1e-6` に固定し、曖昧な境界、非単調な候補、unknown orientation の text page、回転/skew/mirror は fail closed。
- production image limits は `PRODUCTION_IMAGE_LIMITS` に集約し、幅・高さ、画素、資源数、出現数、pixel kind と dimension から検証した実 decoded byte 長、deduplicated PNG bytes を inspection と model validation の両方で検査する。decoded bytes は同じ content resource の複数 occurrence では再加算しない。
- XHTML は画像 occurrence を placement gap ごとに text block と交互に出力する。同じ content hash の PNG は `OEBPS/images/<hash>.png` 一個へ deduplicate し、各 occurrence の provenance は figure attributes に保持する。OPF manifest、relative reference、ZIP entry は同じ content hash から決定的に生成する。
- image-only page と blank page は page class で区別し、converter は `includeImages: true` を指定する。完全な archive bytes の生成後、同一ディレクトリの unique temporary file から atomic rename する。

検証:

- `npm run typecheck` passed
- `npm test` passed: 164 tests
- `npm run verify:image-model -- local-samples --expect-pdf-count 9 --expect-page-count 5141 --expect-image-occurrence-count 4 --expect-unique-content-resource-count 1` passed: 9 PDFs / 5,141 pages / 4 occurrences / 1 unique content resource
- `npm run verify:ruby` passed: 33 pages, 880/880 mapped runs, 373 exact candidates, 2 unresolved retained, 11/11 representative pairs
- `npm run verify:stage2` passed: 9/9 PDFs, 5,141/5,141 semantic pages, 12 context-resolved orientation pages, 223/223 font-pair matches
- `npm run verify:epubcheck` passed: 4/4 real EPUBCheck integration cases
- targeted integration tests cover placement order/ambiguity, limits, XHTML escaping and dimensions, deduplicated OPF/ZIP resources, converter image inclusion, and output preservation on pre-write failure.

中断指示に従い、`npm run verify:epub -- --epubcheck --report-dir <new-local-report-dir>` の9 PDF full EPUB regression はこの checkpoint では未実行です。次セッションはこれを最初に実行し、4 occurrence のXHTML参照、1 unique PNG resource、9/9 EPUBCheck、既存page/ruby/navigation集計を確認してください。

cover selection はこの checkpoint に含めない。private PDF/image bytes、生成 EPUB、local report は repository に追加していない。
