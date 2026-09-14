import assert from "node:assert/strict";
import test from "node:test";
import type { PhysicalPageLayout, PhysicalTextUnit } from "../src/physical-layout.js";
import { buildSemanticBlocks } from "../src/semantic-blocks.js";

function unit(
  index: number,
  position: number,
  text: string,
  inlineStartRatio: number,
  inlineEndRatio: number,
): PhysicalTextUnit {
  const inlineSize = 600;
  const inlineStart = inlineStartRatio * inlineSize;
  const inlineEnd = inlineEndRatio * inlineSize;
  return {
    index,
    position,
    itemCount: [...text].length,
    text,
    inlineStart,
    inlineEnd,
    inlineSpan: inlineEnd - inlineStart,
    inlineStartRatio,
    inlineEndRatio,
    inlineCoverageRatio: inlineEndRatio - inlineStartRatio,
  };
}

function layout(units: PhysicalTextUnit[]): PhysicalPageLayout {
  return {
    orientation: "vertical",
    inlineSize: 600,
    units,
    gaps: units.slice(1).map((current, index) => {
      const previous = units[index];
      if (!previous) throw new Error("missing previous unit");
      return {
        fromUnit: previous.index,
        toUnit: current.index,
        distance: previous.position - current.position,
      };
    }),
  };
}

test("joins a high-confidence physical wrap while retaining sparse spacing provenance", () => {
  const result = buildSemanticBlocks(
    layout([
      unit(0, 700, "前半", 0.12, 0.88),
      unit(1, 676, "後半", 0.14, 0.4),
    ]),
    14,
  );

  assert.equal(result.blocks.length, 1);
  assert.equal(result.text, "前半後半");
  assert.deepEqual(result.decisions[0], {
    fromUnit: 0,
    toUnit: 1,
    gap: 24,
    normalGap: 23.1,
    normalGapSource: "font-fallback",
    normalGapSampleCount: 1,
    gapRatio: 1.039,
    wrapGapThreshold: 31.19,
    paragraphGapThreshold: 40.6,
    previousEndRatio: 0.88,
    previousCoverageRatio: 0.76,
    nextStartRatio: 0.14,
    nearNormalGap: true,
    continuationEdgeGeometry: true,
    wrapCandidate: true,
    largeGap: false,
    join: true,
    reason: "physical-wrap",
  });
});

test("keeps short adjacent units separate even at normal pitch", () => {
  const result = buildSemanticBlocks(
    layout([
      unit(0, 700, "選択肢", 0.12, 0.48),
      unit(1, 676, "↓（ア）へ", 0.13, 0.42),
      unit(2, 652, "次の選択肢", 0.12, 0.5),
    ]),
    14,
  );

  assert.equal(result.blocks.length, 3);
  assert.equal(result.text, "選択肢\n↓（ア）へ\n次の選択肢");
  assert.deepEqual(
    result.decisions.map((decision) => ({
      reason: decision.reason,
      nearNormalGap: decision.nearNormalGap,
      continuationEdgeGeometry: decision.continuationEdgeGeometry,
      wrapCandidate: decision.wrapCandidate,
      largeGap: decision.largeGap,
      normalGapSource: decision.normalGapSource,
      normalGapSampleCount: decision.normalGapSampleCount,
    })),
    [
      {
        reason: "independent-unit",
        nearNormalGap: true,
        continuationEdgeGeometry: false,
        wrapCandidate: false,
        largeGap: false,
        normalGapSource: "distribution",
        normalGapSampleCount: 2,
      },
      {
        reason: "independent-unit",
        nearNormalGap: true,
        continuationEdgeGeometry: false,
        wrapCandidate: false,
        largeGap: false,
        normalGapSource: "distribution",
        normalGapSampleCount: 2,
      },
    ],
  );
});

test("keeps a large-gap boundary while retaining both threshold channels", () => {
  const result = buildSemanticBlocks(
    layout([
      unit(0, 700, "本文前半", 0.1, 0.9),
      unit(1, 676, "本文後半", 0.12, 0.45),
      unit(2, 620, "次段落", 0.1, 0.4),
    ]),
    14,
  );

  assert.equal(result.blocks.length, 2);
  assert.equal(result.blocks[0]?.text, "本文前半本文後半");
  assert.equal(result.blocks[1]?.text, "次段落");

  const decision = result.decisions[1];
  assert.equal(decision?.reason, "large-gap");
  assert.equal(decision?.normalGapSource, "distribution");
  assert.equal(decision?.normalGapSampleCount, 2);
  assert.equal(decision?.normalGap, 24);
  assert.equal(decision?.wrapGapThreshold, 32.4);
  assert.equal(decision?.paragraphGapThreshold, 41.5);
  assert.equal(decision?.nearNormalGap, false);
  assert.equal(decision?.continuationEdgeGeometry, false);
  assert.equal(decision?.wrapCandidate, false);
  assert.equal(decision?.largeGap, true);
  assert.equal(decision?.join, false);
});
