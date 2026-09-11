# Stage 6: EPUB package archive

Baseline: Stage 5 typed XHTML serializer on `main`.

Stage 6 turns the already validated `FileShapeDocument` into complete EPUB 3 archive bytes. It does not change PDF parsing, semantic layout, ruby association, or source provenance.

## Boundary

```text
PDF -> physical layout -> semantic blocks -> ruby/source provenance
    -> FileShapeDocument
    -> EPUB XHTML serializer
    -> EPUB package/archive        <- Stage 6
```

## Generated archive

`serializeEpubPackage(document, options)` produces a `Uint8Array` containing a classic ZIP archive with this order:

```text
mimetype
META-INF/container.xml
OEBPS/package.opf
OEBPS/nav.xhtml
OEBPS/text/page-0001.xhtml
OEBPS/text/page-0002.xhtml
...
```

The `mimetype` entry is always first, has the exact bytes `application/epub+zip`, uses ZIP method 0 (stored/uncompressed), and has no local extra field.

The current writer deliberately stores every entry without compression. This is larger than necessary but keeps archive creation dependency-free and deterministic for a fixed metadata timestamp. Compression can be added later without changing the EPUB model or renderer boundary.

## Package document

`OEBPS/package.opf` contains:

- EPUB package version 3.0;
- unique publication identifier;
- title;
- language;
- optional creator;
- required `dcterms:modified` timestamp;
- manifest entry for `nav.xhtml`;
- one XHTML manifest item per generated source page;
- spine entries in `FileShapeDocument.pages` order.

No heading, chapter, or section semantics are invented here. Until the Document Model has typed section/heading nodes, navigation is page-based and intentionally mechanical.

## Navigation

`OEBPS/nav.xhtml` contains one ordered TOC link per generated XHTML page. This is a valid structural navigation layer, not an attempt to infer chapter titles from font appearance or text content.

## XHTML and ruby

Stage 6 reuses the Stage 5 serializer. Exact ruby therefore remains:

```html
<ruby>漢字<rt>かんじ</rt></ruby>
```

Unresolved ruby still fails closed before archive bytes are produced. Stage 6 never discards uncertain annotation text or guesses a base.

Resolved writing orientation is transported by the XHTML serializer. Raw PDF rotation is not converted into CSS rotation.

## ZIP implementation

The ZIP writer is intentionally small and internal:

- local file headers;
- CRC-32;
- central directory records;
- end-of-central-directory record;
- UTF-8 filenames;
- no ZIP64;
- no compression;
- no data descriptors.

This is sufficient for the current EPUB file set. Entry counts beyond classic ZIP limits fail closed instead of silently producing an invalid archive.

## Stylesheets

Stage 6 does not accept Stage 5's free-form `stylesheetHref`. Allowing a reference without adding the referenced file to the manifest/archive could produce a structurally broken EPUB. CSS packaging should be introduced later as an explicit package resource with bytes, media type, manifest entry, and a renderer-relative href.

## Tests

`test/epub-package.test.ts` checks:

1. exact required file set and order;
2. first ZIP entry is `mimetype`;
3. `mimetype` is uncompressed and exact;
4. container points to `OEBPS/package.opf`;
5. OPF metadata, manifest and spine;
6. page order preservation;
7. EPUB navigation links;
8. exact ruby survives into packaged XHTML;
9. vertical writing mode survives without PDF rotation CSS;
10. metadata XML escaping;
11. unresolved ruby remains fail-closed;
12. malformed required package metadata is rejected.

## Deliberate limitations

This stage does not yet implement:

- cover image/page;
- CSS resources;
- embedded fonts;
- images from source PDFs;
- chapter-aware TOC;
- landmarks/page-list navigation;
- EPUBCheck integration;
- ZIP compression;
- filesystem/UI download adapters.

The output is the complete EPUB archive byte stream. A Node, browser, Worker, or Android caller can persist those bytes as a `.epub` file without changing the document or package model.
