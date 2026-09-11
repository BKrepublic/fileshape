# FileShape parser principles

## Source-agnostic parsing

The parser must not select behavior from a source website, filename pattern, URL fragment, PDF Creator/Producer, N-code, or other site fingerprint.

Parsing decisions are based on PDF structure and geometry only.

## Vertical text and symbols

Glyph appearance is not semantic evidence.

A vertical PDF may contain:

- vertical-font glyphs designed for vertical writing;
- horizontally oriented glyphs placed inside a vertical flow;
- page rotation plus horizontal fonts;
- punctuation, long marks, brackets, periods, Latin characters, or symbols whose visible orientation differs between generators and fonts.

FileShape must therefore:

1. Preserve extracted Unicode characters instead of rotating, replacing, or normalizing them based on glyph appearance.
2. Infer reading order from geometry, item sequence, page transform, spacing, and local flow.
3. Treat unusually shifted glyphs as possible cross-axis outliers instead of immediately starting a new row/column.
4. Avoid character-specific rules such as special handling for `ー`, `。`, `．`, or brackets unless they are semantic EPUB output rules rather than PDF-source detection rules.

The EPUB renderer, writing mode, and selected font should control final vertical glyph presentation wherever possible.

## Whitespace and line breaks

Whitespace evidence should be preserved during parsing. Cleanup belongs to a later post-processing stage.

Default behavior is fidelity-first: preserve detected line/paragraph breaks.

An optional conversion policy may cap consecutive line breaks. For example, `maxConsecutiveLineBreaks = 2` means at most one blank line is retained between text blocks.

The parser should retain gap measurements or equivalent structural evidence so future post-processing can distinguish ordinary wrapping from intentionally large whitespace.

## Preface and afterword removal

Removing prefaces or afterwords is an optional content filter and is disabled by default.

It must be applied after semantic section detection in the FileShape Document Model. Do not implement this as a raw string replacement for words such as `前書き` or `後書き`, because those strings may legitimately occur in story text and would couple behavior to particular generators.
