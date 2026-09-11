import assert from "node:assert/strict";
import test from "node:test";
import type { PhysicalPageLayout } from "../src/physical-layout.js";
import { renderSemanticText } from "../src/semantic-render.js";
import type { SemanticPageBlocks } from "../src/semantic-blocks.js";

function layout(): PhysicalPageLayout {
  return {
    orientation: "vertical",
    inlineSize: 600,
    units: [
      {
        index: 0,
        position: 700,
        itemCount: 1,
        text: "A",
        inlineStart: 100,
        inlineEnd: 500,
        inlineSpan: 400,
        inlineStartRatio: 0.1667,
        inlineEndRatio: 0.8333,
        inlineCoverageRatio: 0.6667,
      },
      {
        index: 1,
        position: 675,
        itemCount: 1,
        text: "B",
        inlineStart: 100,
        inlineEnd: 300,
        inlineSpan: 200,
        inlineStartRatio: 0.1667,
        inlineEndRatio: 0.5,
        inlineCoverageRatio: 0.3333,
      },
      {
        index: 2,
        position: 625,
        itemCount: 1,
        text: "C",
        inlineStart: 100,
        inlineEnd: 300,
        inlineSpan: 200,
        inlineStartRatio: 0.1667,
        inlineEndRatio: 0.5,
        inlineCoverageRatio: 0.3333,
      },
    ],
    gaps: [
      { fromUnit: 0, toUnit: 1, distance: 25 },
      { fromUnit: 1, toUnit: 2, distance: 50 },
    ],
  };
}

function semantic(): SemanticPageBlocks {
  return {
    blocks: [
      { index: 0, kind: "text", unitIndexes: [0], text: "A" },
      { index: 1, kind: "text", unitIndexes: [1], text: "B" },
      { index: 2, kind: "text", unitIndexes: [2], text: "C" },
    ],
    decisions: [],
    text: "A\nB\nC",
  };
}

test("renders semantic blocks with inferred source spacing", () => {
  assert.equal(renderSemanticText(semantic(), layout(), { mode: "preserve" }), "A\nB\n\nC");
});

test("caps semantic source spacing without changing block boundaries", () => {
  assert.equal(
    renderSemanticText(semantic(), layout(), { mode: "cap", maxConsecutiveLineBreaks: 1 }),
    "A\nB\nC",
  );
});
