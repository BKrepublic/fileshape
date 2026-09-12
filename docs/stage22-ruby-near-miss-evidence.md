# Stage 22 ruby near-miss geometry evidence

Stage 22 is a read-only Task 4B evidence checkpoint. It does **not** change production ruby association rules.

## Why this exists

Stage 21 reconciled all 23,097 ruby candidates and showed that 6,387 remain unresolved. The dominant group is 5,004 `no-base` candidates, of which 4,960 are vertical, rotation 0, exact annotation glyph geometry, zero retained base alternatives, and no page glyph issues.

That does not prove the current thresholds are wrong. Many small text runs may simply not be ruby. Before touching `ruby-spans.ts`, Stage 22 measures the nearest body geometry and records which current production gate would reject it.

## Command

```text
npm run inspect:ruby-near-miss -- local-samples \
  --output local-reports/<NEW_FILE>.json \
  --expect-pdf-count 9 \
  --expect-page-count 5141 \
  --expect-unresolved-count 6387
```

The report is local-only and contains no source text.

## Measured gates

For each candidate with usable annotation glyph geometry, body text entries are evaluated against the same structural boundaries used by the production association logic:

- axis alignment;
- body skew;
- annotation/base cross-size ratio (`0.35 <= ratio < 0.75`);
- signed side distance (`0.45 <= distance/body-size <= 1.35`);
- inline proximity (gap no greater than half a body-size).

The tool records the nearest body entry by normalized gate-violation score. This is diagnostic evidence only. A nearest entry is **not** declared to be the linguistic base.

For exact candidates, the tool also records whether the already-selected source-backed base entries satisfy these coarse entry-level gates. This is a control population for detecting a broken diagnostic model.

## Aggregate output

The report and stdout summarize:

- exact/unresolved and reason counts;
- nearest gate signatures for unresolved candidates;
- separate nearest gate signatures for `no-base`;
- `no-base` font-ratio buckets;
- `no-base` side-distance buckets;
- `no-base` inline-gap buckets;
- exact-candidate actual-base eligibility controls.

## Decision rule

Do not widen a threshold merely because many candidates sit close to it.

A production rule change requires all of the following:

1. a reproducible structural population whose current rejection is explained by one bounded gate;
2. positive fixtures that represent that geometry;
3. adversarial negative fixtures showing unrelated small text remains unresolved;
4. source-stable before/after comparison across the full private corpus;
5. no regression in existing exact ruby, source ownership, ruby verifier, Stage 2, EPUB output, or EPUBCheck.

If the dominant `no-base` candidates are geometrically far from any plausible body entry, or resemble unrelated small text, leaving them unresolved is the correct result.

## Privacy / invariants

- no source text or private filename is written to the report;
- no OCR, dictionary, filename, font-name, metadata, or character-specific rule;
- no production thresholds change in Stage 22;
- candidate identity remains source-range based via the accepted Stage 21 inventory contract;
- private reports stay outside Git.
