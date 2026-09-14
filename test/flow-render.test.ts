import assert from "node:assert/strict";
import test from "node:test";
import { renderPageFlowText } from "../src/flow-render.js";
import type { PageFlowResult } from "../src/text-flow.js";

function sampleFlow(): PageFlowResult {
  return {
    orientation: "vertical",
    bodyFontSize: 14,
    bodyFontEvidence: {
      size: 14,
      totalWeight: 20,
      dominantWeight: 16,
      runnerUpWeight: 4,
      dominantSupportRatio: 0.8,
      dominanceMarginRatio: 0.6,
      bucketCount: 2,
    },
    bodyFontSource: "page-local",
    primaryItemCount: 2,
    annotationItemCount: 0,
    marginNoiseItemCount: 0,
    groupCount: 2,
    metrics: {
      singleCharItemRatio: 1,
      verticalRunRatio: 0,
      horizontalRunRatio: 0,
      verticalBaselineRatio: 0,
      horizontalBaselineRatio: 1,
      sequenceVerticalRatio: 1,
      sequenceHorizontalRatio: 0,
    },
    attachedRunEvidence: {
      vertical: { anchorCount: 0, pendingCount: 0, attachedCount: 0, complete: false },
      horizontal: { anchorCount: 0, pendingCount: 0, attachedCount: 0, complete: false },
    },
    groups: [
      { position: 700, itemCount: 1, text: "本文A" },
      { position: 600, itemCount: 1, text: "本文B" },
    ],
    boundaries: [
      {
        gap: 100,
        normalPitch: 25,
        normalPitchSource: "distribution",
        normalPitchSampleCount: 4,
        gapRatio: 4,
        estimatedLineBreaks: 4,
      },
    ],
    text: "本文A\n本文B",
    sourceSpacingText: "本文A\n\n\n\n本文B",
  };
}

test("renders inferred source spacing unchanged in preserve mode", () => {
  assert.equal(
    renderPageFlowText(sampleFlow(), { mode: "preserve" }),
    "本文A\n\n\n\n本文B",
  );
});

test("caps inferred source spacing without modifying stored evidence", () => {
  const flow = sampleFlow();
  assert.equal(
    renderPageFlowText(flow, { mode: "cap", maxConsecutiveLineBreaks: 2 }),
    "本文A\n\n本文B",
  );
  assert.equal(flow.sourceSpacingText, "本文A\n\n\n\n本文B");
  assert.equal(flow.boundaries[0]?.estimatedLineBreaks, 4);
});
