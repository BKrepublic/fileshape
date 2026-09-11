# Stage 12a: source-backed PDF outline navigation

Stage 12a carries explicit PDF outlines through the production PDF-to-EPUB pipeline. It does not infer body heading roles, chapter boundaries, or precise text anchors from an outline label or visual appearance.

## Source and model contract

`readPdfOutline` uses PDF.js `getOutline`, `getDestination` and `getPageIndex`. An explicit destination may identify a zero-based page index, an indirect page reference, or a named destination. Only a resolved page inside the document becomes a local EPUB target. URLs are never followed or emitted as navigation links.

The source store preserves the original outline title, destination, optional external URL, order and hierarchy separately from original PDF text items. A typed `DocumentNavigationItem` references that source by a zero-based outline index path. Model validation checks complete source coverage, exact titles, paths, hierarchy and target agreement, including the presence of resolved pages. The source is cloned when constructing the document.

Missing, external and invalid destinations retain distinct unresolved reasons. Failure to read the outline itself fails extraction instead of silently claiming that no outline exists. PDFs without outlines continue to produce page navigation.

## EPUB behavior

- Resolved entries link to the existing source-page XHTML. Explicit destination arrays, including any coordinates, and named-destination identifiers remain in the source metadata; Stage 12a does not claim a heading-level anchor.
- Entry order, titles and usable hierarchy are retained in the table of contents. Blank titles use the presentation label `Untitled entry`; the original title is unchanged in the model.
- An unresolved parent with usable descendants becomes a non-link label above those descendants.
- Unresolved leaves remain in the model and their labels appear in an ordinary `Other outline entries` section outside the TOC. EPUB navigation does not permit a leaf `span`, so these entries cannot masquerade as links or nonconforming TOC leaves. This ancillary list preserves labels, while the complete hierarchy remains in the source/model.
- With no usable outline target, the page TOC remains available. With outline navigation, a separate hidden `page-list` includes every source page.
- Existing body XHTML, ruby, unresolved notes, OPF and spine remain unchanged. The package reports navigation mode and total/unresolved outline counts; the CLI prints them after conversion.

## Verification

Before implementation, a read-only inventory of the unchanged private corpus found 250 outline entries in six of nine PDFs. All 250 local destinations resolved. Four PDFs have 43 entries each at depth two; two have 39 each at depth one; three have no outlines. These counts are verification expectations, never parser dispatch rules.

Automated coverage includes numeric/indirect/named destinations, out-of-range references, extraction failure, absent outlines, source cloning, model mutation rejection, escaped/supplementary titles, blank labels, unresolved parents/leaves, fallback navigation, page access and deterministic packaging. A package comparison proves that adding an outline to the same model changes only `nav.xhtml`.

The real PDF fixture exercises an actual nested PDF outline, named destinations and an external entry through extraction, model construction and production EPUB packaging. Real EPUBCheck tests cover both that output and all-unresolved fallback navigation, alongside multilingual ruby/notes and deliberate invalid-output rejection.

Full-corpus verification reads the generated ZIP's `nav.xhtml` and checks TOC link counts and page-list coverage. It also retains the existing nine-PDF/5,141-page/archive gates and checks the independently observed 250-entry/six-PDF/zero-unresolved outline contract.

Final measured results are recorded in [continuation status](continuation-status.md) and the [Stage 12a review](stage12a-review.md): 124 automated tests, four real-validator integration tests, all staged regressions, and all nine production EPUBs passed. The full run preserved 5,141 pages and 6,387 unresolved annotations, produced 16,639,748 bytes, and confirmed all 250 outline entries in six PDFs with zero unresolved outline targets and zero EPUBCheck errors or warnings.

## Artifact lifecycle

The full run generated private, ignored per-EPUB JSON reports and a summary under `local-reports/epubcheck-stage12a/`, with staged logs under `local-reports/stage12a-*.log`. All nine reports were read back, their measurements were recorded in the published review, and these Stage 12a artifacts were then removed. Future review artifacts may contain private sample names: never commit them, and remove them after their measured results have been checked and published. Generated temporary EPUBs are removed by the verifier even on failure. The pinned EPUBCheck installation remains reusable development tooling.

## Next increment

Stage 12b must first inspect the available structural evidence for body headings and section boundaries. An outline destination alone identifies a location, not a proven text span or heading role. Record ambiguity explicitly; do not guess relationships from title similarity, filenames, font names, generator metadata or character appearance. Any resulting model/serializer change requires its own staged and full-corpus verification.

## References

- [PDF.js PDFDocumentProxy API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFDocumentProxy.html): outline and destination APIs; the implementation is checked against the pinned `pdfjs-dist` types.
- [EPUB 3.3 navigation document](https://www.w3.org/TR/epub-33/#sec-xhtml-nav): nonempty labels, local publication links, nested lists and the requirement that a `span` label have a following list.
- [Stage 11 EPUBCheck setup](stage11-epubcheck.md): pinned validator, acceptance rules and public/private verification boundaries.
