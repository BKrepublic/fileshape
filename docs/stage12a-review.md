# Stage 12a review

## Scope and result

The implementation adds explicit PDF outline extraction, source-backed typed navigation, hierarchical EPUB TOC generation and navigation counts. It preserves existing page content, ruby, notes, OPF and spine behavior. Body heading/section inference is outside this increment.

Code review found no blocking issues in this scope:

- Destination resolution uses PDF structure, validates page bounds and preserves unresolved reasons. URLs remain source evidence and never become active EPUB links.
- Source cloning and outline index paths preserve provenance. Model validation rejects missing/reordered source entries and title, hierarchy or target mutations.
- The EPUB TOC preserves usable outline hierarchy. Unresolved parents/leaves and blank titles have explicit conforming rendering policies; every source page remains accessible.
- The no-outline case retains page navigation. Tests compare all non-navigation package members with and without outlines and require deterministic output.
- Private samples, report contents and validator binaries remain outside Git. Full-corpus navigation expectations were inventoried before implementation; no source-specific parser dispatch or weakened gate was introduced.

## Local verification

- `npm test`: typecheck and 124 tests passed, zero skipped.
- `npm run verify:epubcheck`: four real-validator tests passed, zero skipped, including production PDF outline conversion and all-unresolved fallback.
- `npm run verify:ruby`: 33 pages, 880/880 mapped text runs, 373 exact candidates, two unresolved retained, representative exact pairs 11/11.
- `npm run verify:stage2`: exit 0; all nine PDFs and 5,141 text pages passed, 12 orientation pages resolved through document context, font-pair semantic equality 223/223. The command also runs the existing semantic sample verifier and requires its success.

`npm run verify:epub -- --epubcheck --report-dir local-reports/epubcheck-stage12a` completed with exit 0: nine PDFs, nine EPUBs, 5,141 pages, 6,387 preserved unresolved annotations and 16,639,748 total bytes. All 250 outline entries in six PDFs resolved; the three PDFs without outlines retained page navigation. Actual archive navigation link counts and page-list coverage passed. All nine EPUBCheck reports had zero fatal errors, errors, warnings and usage messages and were read back independently against the successful summary.

The page and annotation counts match Stage 11. The 16,344-byte increase is consistent with the navigation addition. This is not a claim of whole-corpus historical byte equality: the strict non-navigation byte comparison is a synthetic-model regression test. The pre-existing PDF.js `TT: undefined function: 3` extraction diagnostics remain present and are distinct from EPUBCheck results.

## Publication

The implementation was published as `ede8124356a08ba5054eb3fa2d836f499120dddc`. Author and committer use `136544580+BKrepublic@users.noreply.github.com`. Publication used the existing, authorized Bitwarden SSH Agent; a subsequent remote read confirmed the exact local SHA at GitHub `refs/heads/main`.

[GitHub Actions run 34616492986](https://github.com/BKrepublic/fileshape/actions/runs/34616492986) completed successfully for this exact commit. The full private corpus was verified locally; hosted CI covers the public fixtures.

## Remaining boundaries

Navigation targets identify source pages, not proven body headings or section boundaries. Unresolved outline labels remain visible, but only the source/model retains their complete hierarchy when no usable descendant can be linked. Passing EPUBCheck establishes standards conformance for tested output; it does not establish visual compatibility with every reading system.

The next increment is an evidence assessment for Stage 12b: inspect explicit PDF structure and destination/text correspondence before choosing any heading or section mapping rule. Do not infer semantic roles from outline title similarity alone.
