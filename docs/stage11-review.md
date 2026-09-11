# Stage 11 review and publication

Reviewed commit: `cbe7518764eda5613e849a0fd4375d62c204bd84`.

## Result

No blocking findings in the EPUBCheck integration. The stage is accepted as the validation foundation for the next navigation increment.

- The validator is the official 5.3.0 distribution; its release ZIP digest is pinned and checked before extraction.
- Conversion remains independent of Java. Explicit standards verification fails when the validator is unavailable, its version differs, the process fails, or the report contains errors or warnings.
- Corpus checks still require exactly nine PDFs and 5,141 pages. All nine reports agree with the saved summary, and the annotation/byte totals match Stage 10.
- The real-validator tests accept production output and reject a deliberately nonconforming EPUB. Unit tests cover incomplete evidence and process/report disagreement.
- Source text, ruby handling, the parser, model and production serializers were not changed in this stage. Local PDF samples, reports and validator binaries are excluded from Git.
- Temporary publications are removed after verification; retained local reports are review artifacts with the lifecycle documented in Stage 11.

## Publication evidence

The commit's author and committer use `136544580+BKrepublic@users.noreply.github.com`. SSH publication via the existing Bitwarden SSH Agent succeeded, and a subsequent remote read confirmed `refs/heads/main` at the exact commit above. The configured HTTPS remote, SSH identities and known_hosts were not changed.

[GitHub Actions run 34614178141](https://github.com/BKrepublic/fileshape/actions/runs/34614178141) completed successfully for this exact commit, including the standards integration tests. The full private corpus remains a separately verified local run, not a hosted-CI claim.

## Next increment

Stage 12a will carry explicit PDF outline entries into a source-backed typed navigation tree and hierarchical EPUB navigation. The read-only corpus inventory found 250 entries in six PDFs, with depth one or two; three PDFs have no outline.

Use PDF destination resolution and preserve outline order/title/hierarchy. Unresolvable destinations must remain explicit and cannot become guessed links. PDFs without usable outline links retain page navigation. This increment does not infer body heading roles or chapter boundaries from appearance; those remain a subsequent, separately validated increment.
