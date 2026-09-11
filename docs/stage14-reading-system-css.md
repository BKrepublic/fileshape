# Stage 14: reading-system CSS and packaged resources

This checkpoint advances Task 2B from `docs/remaining-work/02-reading-systems.md` while Task 1 body heading/section mapping remains on hold after Stage 13a found zero source-backed outline anchors.

## Implemented

- a deterministic local stylesheet at `OEBPS/styles/fileshape.css`;
- OPF manifest registration as `text/css`;
- relative stylesheet links from `nav.xhtml` and every body XHTML page;
- reflow-safe vertical/horizontal writing rules, ruby styling and unresolved-note styling;
- unresolved annotations grouped under a visible `Notes` section without changing their preserved source strings;
- explicit `pageProgressionDirection: "ltr" | "rtl"` package option and matching CLI flag;
- no automatic page-progression inference from the majority of page orientations;
- tests for manifest/resource/link consistency and absence of absolute/fixed-size layout rules;
- a deterministic reading-system fixture EPUB generator covering horizontal/vertical mixed pages, exact and long ruby, supplementary and combining Unicode, Latin/numbers/punctuation, preserved whitespace, an unresolved annotation, hierarchical navigation and an empty page.

The existing per-page inline `writing-mode` remains as a conservative fallback. PDF rotation is still not serialized as a visual transform.

## Reader fixture

Generate the fixture without using private PDFs:

```text
npm run fixture:reader -- reading-system-fixture.epub
```

The fixture uses explicit RTL page progression only to exercise that metadata path. Production conversion does not infer progression from page orientation; callers must opt into `--page-progression-direction ltr|rtl` when they have publication-level evidence.

## Not yet accepted

Task 2 is not complete until real-reader validation is performed. Thorium Reader and calibre E-book viewer are the initial desktop targets from the runbook. Android reader validation is additional and must not be claimed unless actually executed.

Required final checks for this package/XHTML change remain:

```text
npm test
npm run verify:epubcheck
npm run verify:epub -- --epubcheck --report-dir <new-local-report-dir>
```

The private 9-PDF corpus must remain 9/9 EPUB, 5,141/5,141 pages, with source ownership, outline navigation and unresolved annotation preservation intact. EPUBCheck fatal/error/warning counts must remain zero.
