import assert from "node:assert/strict";
import test from "node:test";
import type { InspectTextItem } from "../src/pdf-inspection-model.js";
import {
  clusterTextItemsByAxis,
  clusterVerticalGlyphColumns,
  ordinaryCrossAxisTolerance,
  verticalGlyphColumnTolerance,
} from "../src/layout-clustering.js";
import { fullTextRef } from "../src/source-text.js";

function item(
  text: string,
  displayX: number,
  displayY: number,
  itemIndex: number,
  fontSize = 14,
): InspectTextItem {
  return {
    text,
    dir: "ltr",
    fontName: "f1",
    width: fontSize,
    height: fontSize,
    transform: [fontSize, 0, 0, fontSize, displayX, displayY],
    x: displayX,
    y: displayY,
    displayTransform: [fontSize, 0, 0, fontSize, displayX, displayY],
    displayX,
    displayY,
    fontSize,
    hasEOL: false,
    source: fullTextRef(1, itemIndex, text),
  };
}

test("ordinary cross-axis clustering uses one shared scale-aware tolerance", () => {
  assert.equal(ordinaryCrossAxisTolerance(14), 5.88);
  assert.equal(ordinaryCrossAxisTolerance(28), 11.76);

  const clusters = clusterTextItemsByAxis([
    item("a", 100, 20, 0),
    item("b", 104, 40, 1),
    item("c", 120, 60, 2),
  ], "x", ordinaryCrossAxisTolerance(14));

  assert.equal(clusters.length, 2);
  assert.deepEqual(clusters.map((cluster) => cluster.items.map((entry) => entry.text)), [["a", "b"], ["c"]]);
});

test("vertical glyph columns are geometry-first even when source emission is interleaved", () => {
  assert.equal(verticalGlyphColumnTolerance(14), 17.5);
  const columns = clusterVerticalGlyphColumns([
    item("右", 700, 100, 0),
    item("左", 670, 100, 1),
    item("列", 700, 114, 2),
    item("列", 670, 114, 3),
  ], 14);

  assert.deepEqual(columns.map((column) => column.items.map((entry) => entry.text).join("")), ["右列", "左列"]);
});

test("vertical glyph order uses source order only inside a local overlap group", () => {
  const localOverlap = clusterVerticalGlyphColumns([
    item("後", 700, 100, 1),
    item("先", 700, 106, 0),
  ], 14)[0]!;
  assert.equal(localOverlap.items.map((entry) => entry.text).join(""), "先後");

  const separated = clusterVerticalGlyphColumns([
    item("下", 700, 120, 0),
    item("上", 700, 100, 1),
  ], 14)[0]!;
  assert.equal(separated.items.map((entry) => entry.text).join(""), "上下");
});
