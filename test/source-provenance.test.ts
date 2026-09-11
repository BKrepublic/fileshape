import assert from "node:assert/strict";
import test from "node:test";
import { reconstructPhysicalLayout } from "../src/physical-layout.js";
import { buildSemanticBlocks } from "../src/semantic-blocks.js";
import { glyphPage } from "./glyph-fixtures.js";

test("source ranges survive physical item and semantic wrap joins", () => {
  const page = glyphPage([
    { chars: ["A", "B"], advances: [250, 250], x: 400, y: 140, size: 14 },
    { chars: ["C"], advances: [10], x: 400, y: 640, size: 14 },
    { chars: ["D", "E"], advances: [14, 14], x: 376, y: 100, size: 14 },
  ]);
  const physical = reconstructPhysicalLayout(page, "vertical", 14);
  assert.deepEqual(physical.units.map((u) => u.text), ["ABC", "DE"]);
  assert.deepEqual(physical.units[0]?.sourceRanges?.map((r) => r.itemIndex), [0, 1]);
  const semantic = buildSemanticBlocks(physical, 14);
  assert.equal(semantic.blocks.length, 1);
  assert.equal(semantic.text, "ABCDE");
  assert.deepEqual(semantic.blocks[0]?.sourceRanges?.map((r) => r.itemIndex), [0, 1, 2]);
  const refs = semantic.blocks[0]!.sourceRanges!;
  assert.equal(refs.map((r) => page.textItems[r.itemIndex]!.text.slice(r.charStart, r.charEnd)).join(""), "ABCDE");
  refs[0]!.charEnd = 0;
  assert.equal(physical.units[0]!.sourceRanges![0]!.charEnd, 2);
});
