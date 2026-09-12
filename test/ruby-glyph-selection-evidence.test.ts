import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyNoSelectionGeometry,
  summarizeRubyGlyphSelection,
  type RubyGlyphSelectionCandidate,
} from "../src/ruby-glyph-selection-evidence.js";

test("no-selection geometry distinguishes partial overlap from whitespace gaps", () => {
  assert.deepEqual(
    classifyNoSelectionGeometry([{ lo: 0, hi: 10 }], 8, 12),
    { relation: "partial-overlap-at-most-half", maxOverlapRatio: 0.2 },
  );
  assert.deepEqual(
    classifyNoSelectionGeometry([{ lo: 0, hi: 10 }, { lo: 20, hi: 30 }], 12, 18),
    { relation: "between-glyphs", maxOverlapRatio: 0 },
  );
});

test("no-selection geometry distinguishes outside and invalid glyph cells", () => {
  assert.deepEqual(
    classifyNoSelectionGeometry([{ lo: 10, hi: 20 }], 0, 5),
    { relation: "before-all-glyphs", maxOverlapRatio: 0 },
  );
  assert.deepEqual(
    classifyNoSelectionGeometry([{ lo: 10, hi: 20 }], 25, 30),
    { relation: "after-all-glyphs", maxOverlapRatio: 0 },
  );
  assert.deepEqual(
    classifyNoSelectionGeometry([{ lo: 4, hi: 4 }], 4, 5),
    { relation: "no-positive-glyph-cells", maxOverlapRatio: null },
  );
});

function candidate(overrides: Partial<RubyGlyphSelectionCandidate>): RubyGlyphSelectionCandidate {
  return {
    candidateId: "candidate",
    page: 1,
    status: "unresolved",
    reason: "no-base",
    replayStatus: "unresolved",
    replayReason: "no-base",
    replayMatchesProduction: true,
    stage: "no-glyph-selected",
    eligibleLineCount: 1,
    choiceCount: 0,
    selectedGlyphCount: 0,
    boundaryUncertain: false,
    overhangUncertain: false,
    lineGlyphUnmapped: false,
    noncontiguous: false,
    noSelectionRelation: "between-glyphs",
    maxGlyphOverlapRatio: 0,
    ...overrides,
  };
}

test("corpus summary keeps no-base eligible-line and selection evidence separate", () => {
  const exact = candidate({
    candidateId: "exact",
    status: "exact",
    reason: "unique-contiguous-span",
    replayStatus: "exact",
    replayReason: "unique-contiguous-span",
    stage: "unique-choice",
    eligibleLineCount: 1,
    choiceCount: 1,
    selectedGlyphCount: 2,
    noSelectionRelation: "not-applicable",
    maxGlyphOverlapRatio: null,
  });
  const noLine = candidate({
    candidateId: "no-line",
    stage: "no-eligible-line",
    eligibleLineCount: 0,
    noSelectionRelation: "not-applicable",
    maxGlyphOverlapRatio: null,
  });
  const report = summarizeRubyGlyphSelection([{
    pdfId: "sha256:test",
    pages: 1,
    candidates: 3,
    exactCandidates: 1,
    unresolvedCandidates: 2,
    replayMismatches: 0,
    reports: [exact, candidate({ candidateId: "gap" }), noLine],
  }]);
  assert.equal(report.noBaseEligibleLineCount, 1);
  assert.deepEqual(report.noBaseStageCounts, {
    "no-glyph-selected": 1,
    "no-eligible-line": 1,
  });
  assert.deepEqual(report.noBaseNoSelectionRelationCounts, {
    "between-glyphs": 1,
    "not-applicable": 1,
  });
  assert.equal(report.replayMismatches, 0);
});
