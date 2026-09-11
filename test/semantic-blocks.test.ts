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

test("joins a high-confidence physical wrap", () => {
  const result = buildSemanticBlocks(
    layout([
      unit(0, 700, "前半", 0.12, 0.88),
      unit(1, 676, "後半", 0.14, 0.4),
    ]),
    14,
  );

  assert.equal(result.blocks.length, 1);
  assert.equal(result.text, "前半後半");
  assert.equal(result.decisions[0]?.reason, "physical-wrap");
  assert.equal(result.decisions[0]?.join, true);
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
    result.decisions.map((decision) => decision.reason),
    ["independent-unit", "independent-unit"],
  );
});

test("keeps a large-gap boundary even when the previous unit reaches the end", () => {
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
  assert.equal(result.decisions[1]?.reason, "large-gap");
});
