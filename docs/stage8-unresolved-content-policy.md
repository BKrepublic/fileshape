# Stage 8: unresolved annotation content policy

Stage 8 adds an explicit policy boundary for unresolved ruby candidates. Parser evidence remains unchanged: Stage 3 still decides only `exact` versus `unresolved`, and Stage 4 still retains all source ranges, alternatives, reasons, and glyph evidence.

## Policies

The library serializer default remains strict:

```text
unresolvedRubyPolicy = "error"
```

Any unresolved candidate aborts direct EPUB serialization unless the caller explicitly selects another policy.

For production conversion where dropping source text is worse than preserving uncertain annotation separately:

```text
unresolvedRubyPolicy = "preserve-as-page-note"
```

Each unresolved annotation is resolved directly from its original `SourceTextRef[]` and emitted at the end of its source page as an `<aside class="fileshape-unresolved-annotation">`. It is not emitted as `<ruby>`, attached to a guessed base, merged into body text, or normalized from reconstructed strings.

The original `FileShapeDocument` remains unchanged. Reason, source ranges, alternatives, and all Stage 3 evidence remain available in the model for later parser improvements.

## CLI

The user-facing PDF-to-EPUB CLI defaults to `preserve-as-page-note` so ordinary conversion does not abort merely because a geometrically uncertain annotation exists. It reports the number of preserved unresolved annotations after conversion.

```text
npm run convert:epub -- input.pdf output.epub
```

Strict behavior is still available explicitly:

```text
npm run convert:epub -- input.pdf output.epub --unresolved-ruby error
```

Accepted values:

- `error`
- `preserve-as-page-note`

## Safety properties

- exact ruby behavior is unchanged;
- unmapped exact ruby still fails document-model validation;
- unresolved candidates with no annotation source ranges fail closed;
- preserved annotation text is resolved from original source items;
- XML special characters are escaped only at render time;
- parser/source structures are not mutated by policy application;
- no source-specific, filename-specific, font-specific, or character-specific rule is introduced.

## Tests

`test/content-policy.test.ts` covers strict failure, non-mutating source-backed preservation, XHTML note rendering, XML escaping, package propagation, and missing-source failure.

`test/pdf-to-epub-policy.test.ts` covers the CLI-facing default with a real PDF containing unrelated small text, verifies that text is preserved outside `<ruby>`, and verifies explicit strict mode still aborts.
