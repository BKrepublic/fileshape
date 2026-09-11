# Stage 5: EPUB XHTML serialization

Baseline: `57492cdb518389d5dda129c3353830fd563b904d` (typed FileShape Document Model).

This stage converts a validated `FileShapeDocument` into deterministic EPUB3-compatible XHTML page resources. It does not package a complete `.epub` archive yet.

## Boundary

```text
PDF extraction
    ↓
physical layout
    ↓
semantic blocks
    ↓
exact ruby/source provenance
    ↓
FileShapeDocument
    ↓
content policy / unresolved decisions
    ↓
EPUB XHTML serializer        ← this stage
    ↓
OPF/nav/container/ZIP        ← later stage
```

The serializer does not inspect PDF metadata, filenames, websites, fonts, or glyph appearance. Parser decisions remain upstream.

## Public API

`serializeEpubXhtml(document, options)` is the only public serialization entrypoint.

The serializer validates the complete `FileShapeDocument` before emitting output. Page-only rendering stays internal so callers cannot bypass source-provenance validation by supplying a detached page node.

The result contains one XHTML resource per source page:

```text
text/page-0001.xhtml
text/page-0002.xhtml
...
```

Each result entry carries the source page number, EPUB media type, deterministic href, and XHTML text.

## Exact ruby

A typed exact ruby inline becomes EPUB3/HTML ruby markup:

```html
<ruby>漢字<rt>かんじ</rt></ruby>
```

The serializer consumes the already-resolved `RubyInlineNode`. It does not search strings, re-run geometry, split ligatures, divide widths, or infer base/annotation boundaries.

Both base text and annotation text are XML-escaped after Document Model validation confirms that they resolve from their original source ranges.

## Unresolved ruby

Unresolved ruby is fail-closed.

If any page still contains `unresolvedRuby`, serialization throws instead of silently discarding uncertain annotation text or guessing a base. A content-policy stage must explicitly resolve how such evidence should be handled before a production EPUB is emitted.

Likewise, an unmapped exact ruby span is not rendered.

## Source text and whitespace

Ordinary inline text is emitted from the source-backed inline nodes, not from a new reconstruction. XML-sensitive characters are escaped and `xml:space="preserve"` is attached to text blocks.

This intentionally favors source preservation at the serializer boundary. A later content/whitespace policy may normalize presentation, but the serializer itself does not trim, collapse, insert, or rewrite source text.

## Writing orientation

Resolved Document Model orientation is transported to XHTML:

- `vertical` → `writing-mode: vertical-rl`
- `horizontal` → `writing-mode: horizontal-tb`
- `unknown` → explicit unknown class, with no guessed writing mode

Original PDF page rotation is provenance, not EPUB presentation. The serializer does not emit CSS rotation from the PDF page rotation value.

## XML safety

Text and attribute values are escaped separately. The XHTML document includes the XHTML namespace and EPUB namespace, language attributes, UTF-8 metadata, and an optional escaped stylesheet href.

## Deliberately not implemented yet

This stage does not yet create:

- `mimetype`
- `META-INF/container.xml`
- package OPF metadata/manifest/spine
- navigation document / TOC
- cover resources
- CSS resource files
- chapter/section inference
- heading inference
- image extraction/embedding
- final ZIP packaging
- unresolved-ruby content policy

Those concerns should consume the typed model or the XHTML resource set without modifying parser behavior.
