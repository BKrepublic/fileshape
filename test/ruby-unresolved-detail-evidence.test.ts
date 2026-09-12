import assert from "node:assert/strict";
import test from "node:test";
import {
  boundaryBucket,
  gapBucket,
  minGapBucket,
  overhangBucket,
  summarizeRubyUnresolvedDetail,
  type RubyUnresolvedDetail,
} from "../src/ruby-unresolved-detail-evidence.js";

test("detail buckets preserve production threshold boundaries", () => {
  assert.equal(gapBucket(0.5), ">0.25-0.50");
  assert.equal(gapBucket(0.50001), ">0.50-1.00");
  assert.equal(minGapBucket(-0.05), "-0.05-<0");
  assert.equal(minGapBucket(-0.05001), "-0.50-<-0.05");
  assert.equal(boundaryBucket(0.01), ">0.005-0.010");
  assert.equal(boundaryBucket(0.01001), ">0.010-0.020");
  assert.equal(overhangBucket(0.5, 0), ">0.25-0.50");
  assert.equal(overhangBucket(0.50001, 0), ">0.50-0.75");
});

function candidate(overrides: Partial<RubyUnresolvedDetail>): RubyUnresolvedDetail {
  return {
    candidateId: "candidate",
    page: 1,
    status: "unresolved",
    reason: "noncontiguous-base",
    replayStatus: "unresolved",
    replayReason: "noncontiguous-base",
    replayMatchesProduction: true,
    stage: "noncontiguous-selection",
    eligibleLineCount: 1,
    selectedGlyphCount: 2,
    choiceCount: 0,
    continuityFailures: ["wide-gap"],
    maxPositiveGapRatio: 0.6,
    minGapRatio: 0.6,
    sameItemSourceGapCount: 0,
    crossItemTransitionCount: 0,
    missingSourceTransitionCount: 0,
    nearestBoundaryCenterRatio: 0.2,
    startOverhangRatio: 0,
    endOverhangRatio: 0,
    ...overrides,
  };
}

test("summary separates noncontiguous and ambiguous evidence from exact controls", () => {
  const exact = candidate({
    candidateId: "exact",
    status: "exact",
    reason: "unique-contiguous-span",
    replayStatus: "exact",
    replayReason: "unique-contiguous-span",
    stage: "unique-choice",
    choiceCount: 1,
    continuityFailures: [],
    maxPositiveGapRatio: 0.1,
    minGapRatio: 0.1,
    nearestBoundaryCenterRatio: 0.03,
  });
  const boundary = candidate({
    candidateId: "boundary",
    reason: "ambiguous-base",
    replayReason: "ambiguous-base",
    stage: "boundary-uncertainty",
    continuityFailures: [],
    maxPositiveGapRatio: 0.1,
    minGapRatio: 0.1,
    nearestBoundaryCenterRatio: 0.004,
  });
  const report = summarizeRubyUnresolvedDetail([{
    pdfId: "sha256:test",
    pages: 1,
    candidates: 3,
    exactCandidates: 1,
    unresolvedCandidates: 2,
    replayMismatches: 0,
    reports: [exact, candidate({ candidateId: "gap" }), boundary],
  }]);
  assert.deepEqual(report.noncontiguousFailureCounts, { "wide-gap": 1 });
  assert.deepEqual(report.noncontiguousMaxPositiveGapBuckets, { ">0.50-1.00": 1 });
  assert.deepEqual(report.ambiguousBoundaryDistanceBuckets, { ">0.0025-0.005": 1 });
  assert.deepEqual(report.exactMaxPositiveGapBuckets, { ">0.05-0.25": 1 });
  assert.equal(report.replayMismatches, 0);
});
