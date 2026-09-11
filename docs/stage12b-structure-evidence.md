# Stage 12b: explicit structure evidence assessment

## Decision

The private corpus supplies no explicit body heading tags through the pinned PDF.js structure-tree API. Stage 12a outline navigation remains the verified production behavior. Body heading/section mapping stays open until destination-to-source-range evidence supports a separate mapping contract.

This assessment completes the explicit-tag inventory, not Stage 12b's eventual heading/section implementation. Zero tags do not mean zero visual headings, and an outline link does not identify a proven heading text span.

## Reproducible inventory

```sh
npm run inspect:structure -- input.pdf
npm run inspect:structure -- local-samples --output local-reports/structure-NEW.json
```

The command accepts a PDF or a directory of PDFs and calls `getStructTree()` on every page, even when `MarkInfo.Marked` is false or absent. It counts tree nodes, standard `H`/`H1` through `H6` roles after PDF RoleMap resolution, and content/object references. It reads neither body text nor outline titles. File basenames appear in the local report. Missing inputs, unreadable PDFs, API errors and invalid options fail the command; an existing output file is never overwritten.

The installed `pdfjs-dist` 6.3.289 implementation returns `MarkInfo` as a JavaScript Map, while its declaration describes an object. This was observed in the real tagged-PDF positive-control test and confirmed in the installed worker's `readMarkInfo` implementation. The inventory normalizes that representation and validates all three Boolean flags before JSON serialization, avoiding an empty-object report that would lose them.

The exact final local command was:

```sh
node --import tsx src/pdf-structure-inventory.ts local-samples --output local-reports/stage12b-structure-final.json
```

This invokes the same entry point without the standalone `tsx` CLI's sandbox IPC requirement.

## Observations on 2026-09-11

The final command exited 0. The saved report was read back and its complete scan coverage checked.

| PDF page-count group | PDFs | Pages scanned | Pages exposing a structure tree | Heading nodes |
| --- | ---: | ---: | ---: | ---: |
| 34 / 46 / 33 pages | 3 | 113 | 0 | 0 |
| 1,377 pages | 2 | 2,754 | 0 | 0 |
| 914 pages | 2 | 1,828 | 0 | 0 |
| 223 pages | 2 | 446 | 0 | 0 |
| Total | 9 | 5,141 / 5,141 | 0 | 0 |

`MarkInfo` was null in all nine PDFs. Structure nodes, content references and object references were also zero. These are results from this API/version and corpus, not a byte-level audit of all possible PDF structural metadata or a visual/manual heading certification.

## Review and verification

No blocking findings in the diagnostic scope. The inspector is a separate entry point and is not imported into production conversion. It does not infer roles from appearance or use metadata as a dispatch rule. It completes the full page loop before reporting success, and resource cleanup runs on success and failure.

`npm test` passed typecheck and 126 tests, with zero skipped tests. New real-PDF controls verify a custom RoleMap resolving to H1, nested structure and content references, both true and false MarkInfo flags, the absence of body tags despite an outline, and a missing-file failure. The positive control proves that the all-zero corpus observation is not simply a counter that always returns zero.

The four standards integration tests and full production/staged corpus runs belong to the immediately preceding, unchanged Stage 12a conversion code. They were not rerun locally solely for this diagnostic addition. Hosted CI will run the public test and standards suites for the publication commit.

## Next mapping contract

The next bounded analysis should retain destination kind/coordinates and original source ranges, account for page rotation and vertical text, and distinguish a page viewport destination from a precise text anchor. Duplicate destinations, multiple headings on one page, parents/children pointing to the same page and nonmonotonic outline order must remain explicit. A title match may be diagnostic evidence, never sufficient provenance for assigning a role or deleting text.

Only after that evidence and its ambiguity cases are reviewed should the model gain section/heading relationships. That production change will require exact source ownership checks, adversarial fixtures and fresh ruby/semantic/full EPUB/EPUBCheck runs.

## Local artifacts

The first inventory report and corrected final report under `local-reports/` are ignored and contain private basenames. They belong to this review and are removed after the aggregate results are validated and published here. The inspector and synthetic fixtures remain reproducible project tooling; no PDF samples or report contents are committed.

## Reference

[PDF.js PDFDocumentProxy and PDFPageProxy API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFDocumentProxy.html) documents the structure/metadata entry points. Runtime and type behavior were checked against the project's installed, pinned distribution.
