# 工程3：表紙・挿絵の抽出と同梱

## 現在地

2026-09-12、Stage 15〜19 により通常画像の evidence -> model -> placement -> XHTML/OPF/ZIP integration -> hardened private acceptance まで完了しました。

Accepted private aggregate:

```text
9 PDFs / 5141 pages
4 image occurrences
4 model resources across source PDFs
1 unique PNG content resource
0 interpolated occurrences
XHTML/OPF/ZIP references: consistent
EPUBCheck 5.3.0: 9/9 passed (0 errors, 0 warnings)
```

Stage 19 review hardening後、non-uniform scaling、unsupported compositing、layered overlap、invalid transform/clip evidence、oversized raw resources、unsupported interpolationは安全に fail closed します。

**通常画像 preservation は accepted。次は explicit/source-backed cover policy です。**

## 目的

本文中の画像 occurrence をsource provenanceと読み順を保ってEPUBへ入れ、表紙は明示された根拠がある場合だけ指定します。画像内容・ページ番号・サイズ・位置・filename・見た目からcoverを推測しません。

## 3A：画像 evidence

完了済み。現在のprivate corpusを再棚卸ししません。新しいoperator schema、fixture、corpusを追加した場合だけ必要範囲を再調査します。

Known corpus evidence:

```text
IMAGE_PAINTS=4
XOBJECT_PAINTS=4
EXTRACTED_RESOURCES=4
UNSUPPORTED_RESOURCES=0
UNIQUE_CONTENT_RESOURCES=1
all four resources: 800x600 RGB24
CLIP_STATUS_COUNTS={"exact-rect":4}
CLIP_COVERAGE_COUNTS={"contains-image":4}
IMAGE_ISSUES=0
MARKED_OCCURRENCES=0
```

## 3B：production image model / placement

完了済み。以下がaccepted contractです。

- image bytes/resource identity と source occurrenceを分離;
- content hashでbytesだけをdedupeし occurrenceは保持;
- exact page/operator/occurrence provenance;
- geometry-backed placement;
- image-only page / blank page distinction;
- production limits;
- unsupported clip/compositing/layering/interpolationをfail closed;
- atomic output replacement。

## 3C：EPUB integration

完了済み。

- deterministic `OEBPS/images/<contentHash>.png`;
- matching OPF image manifest item;
- XHTML relative refs;
- every occurrence emitted independently;
- verifier cross-checks XHTML occurrence -> OPF item -> ZIP resource;
- private acceptance: 4/4 occurrences, 1/1 unique PNG, EPUBCheck 9/9 clean。

## 3D：explicit cover policy

これが次の実装checkpointです。

### Cover selection contract

1. **既定ではcover未指定**。PDFに画像があっても自動選択しません。
2. 初期CLIは exact source occurrence を明示する方式とします:

```text
--cover-occurrence PAGE:OPERATOR:OCCURRENCE
```

3. `PAGE` は1以上の整数、`OPERATOR` / `OCCURRENCE` は0以上の整数。syntax error はCLI parse時に失敗します。
4. conversion後の `FileShapeDocument` に `(sourcePage, operatorIndex, occurrenceIndex)` が一致する `DocumentImageOccurrence` が **ちょうど1件** 存在しなければ失敗します。不存在、重複、resource欠落を推測で補いません。
5. 選択した occurrence の `resourceId` をcover resourceとします。同じcontent resourceが本文中に複数 occurrenceとして使われていても、resource bytesを複製しません。
6. OPF manifestでは選択resourceのimage itemだけに EPUB 3 `properties="cover-image"` を付けます。cover未指定時はどのimage itemにも `cover-image` を付けません。
7. **元の本文 occurrence は削除・移動・非表示にしません。** Cover指定はpublication metadata/resource semanticsの追加であり、source bodyを変更する理由にはしません。
8. 初期checkpointではsynthetic `cover.xhtml` / extra spine itemを追加しません。既存本文 occurrenceとは別の可視cover pageを自動生成すると表示回数を増やすためです。将来reader互換性の実証で必要になった場合だけ別checkpointにします。
9. cover inferenceにpage=1、最大画像、aspect ratio、filename、Creator/Producer、OCR、画像内容、視覚特徴を使いません。
10. user指定以外のsource-backed cover metadataを将来扱う場合も、別の明示evidence adapterとして追加し、user selectorと同じresolverへ収束させます。

### API contract

Package層にはsource selectorを直接持ち込まず、document上の exact occurrence を解決した後の `coverImageResourceId?: string` を渡します。Package serializerはそのresourceが存在すること、一意なimage manifest itemであることを検証します。

PDF -> EPUB層には source occurrence selector typeを追加し、document構築後にresource IDへ解決します。これによりpackage層がPDF operator semanticsへ依存しません。

### Failure boundary

cover selector parse、occurrence解決、resource検証、OPF生成のいずれかが失敗した場合、EPUB output pathを置換しません。既存atomic output contractを維持します。

### Focused tests

最低限:

- cover option無し -> `cover-image` property無し;
- valid exact occurrence -> 対応image itemだけ `properties="cover-image"`;
- source occurrenceはbody XHTMLに残る;
- same resourceを複数 occurrenceが共有していてもPNGは1個、cover markerも1個;
- malformed selector;
- missing occurrence;
- ambiguous/duplicate provenance corruption;
- missing resource;
- default conversion output semanticsがcover未指定時に変わらない;
- real EPUBCheck fixtureでcover指定/未指定の両方がclean。

### Acceptance

Public:

```sh
npm test
npm run verify:epubcheck
```

Package/CLI変更のため、private corpusでもfresh report directoryを使って full EPUB regressionを再実行します。cover未指定のdefault regressionはStage 19 baselineを維持する必要があります。Cover指定private testはprivate imageの内容やfilenameをcommitせず、既知の exact occurrence provenanceだけをlocal selectorとして渡し、EPUBCheck cleanとmanifest markerをprivacy-safe aggregateで確認します。

## 完了条件

工程3を閉じるには:

- 通常画像 preservation accepted;
- explicit cover selector accepted;
- cover無し入力でcoverを推測しない;
- cover指定時にexact occurrence -> resource -> OPF `cover-image` が追跡可能;
- original body occurrence欠落0;
- XHTML/OPF/ZIP ref不整合0;
- unsupported image/effectが黙って欠落しない;
- public tests/EPUBCheck green;
- private full regression green;
- docs/continuation-status.md と roadmap更新。

## 禁止事項

- 表紙らしさを画像内容や配置からスコアリングしない;
- first page / largest imageなどを暗黙defaultにしない;
- body occurrenceをcover指定の副作用で削除しない;
- unsupported imageをcover候補から除外しただけで通常変換成功扱いにしない;
- private image/PDF/generated EPUB/local reportをcommitしない。
