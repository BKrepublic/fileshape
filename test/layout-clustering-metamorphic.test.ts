import assert from "node:assert/strict";
import test from "node:test";
import {
  clusterTextItemsByAxis,
  clusterVerticalGlyphColumns,
  glyphSequenceRatios,
  ordinaryCrossAxisTolerance,
  orderVerticalGlyphItems,
  verticalTextLayoutMode,
} from "../src/layout-clustering.js";
import type { InspectTextItem } from "../src/pdf-inspection-model.js";

function item(
  text: string,
  displayX: number,
  displayY: number,
  fontSize = 14,
  sourceItemIndex?: number,
): InspectTextItem {
  return {
    text,
    dir: "ltr",
    fontName: "FixtureFace",
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
    ...(sourceItemIndex === undefined
      ? {}
      : { source: { page: 1, itemIndex: sourceItemIndex, charStart: 0, charEnd: text.length } }),
  };
}

function scaled(
  items: readonly InspectTextItem[],
  scale: number,
  translateX = 0,
  translateY = 0,
): InspectTextItem[] {
  return items.map((entry) => ({
    ...entry,
    width: entry.width * scale,
    height: entry.height * scale,
    transform: [
      entry.transform[0]! * scale,
      entry.transform[1]! * scale,
      entry.transform[2]! * scale,
      entry.transform[3]! * scale,
      entry.transform[4]! * scale + translateX,
      entry.transform[5]! * scale + translateY,
    ],
    x: entry.x * scale + translateX,
    y: entry.y * scale + translateY,
    displayTransform: [
      entry.displayTransform[0]! * scale,
      entry.displayTransform[1]! * scale,
      entry.displayTransform[2]! * scale,
      entry.displayTransform[3]! * scale,
      entry.displayTransform[4]! * scale + translateX,
      entry.displayTransform[5]! * scale + translateY,
    ],
    displayX: entry.displayX * scale + translateX,
    displayY: entry.displayY * scale + translateY,
    fontSize: entry.fontSize * scale,
  }));
}

function clusterTexts(items: InspectTextItem[], bodyFontSize: number): string[][] {
  return clusterTextItemsByAxis(items, "x", ordinaryCrossAxisTolerance(bodyFontSize))
    .map((cluster) => cluster.items.map((entry) => entry.text));
}

test("ordinary cross-axis clustering is invariant under uniform scale and translation", () => {
  const original = [
    item("A", 100, 100),
    item("B", 104, 120),
    item("C", 120, 100),
  ];
  const expected = clusterTexts(original, 14);

  assert.deepEqual(expected, [["A", "B"], ["C"]]);
  assert.deepEqual(clusterTexts(scaled(original, 3, 71, -29), 42), expected);
});

test("ordinary cross-axis tolerance is inclusive at the boundary and separates just outside it", () => {
  const tolerance = ordinaryCrossAxisTolerance(10);
  assert.equal(
    clusterTextItemsByAxis([item("A", 0, 100, 10), item("B", tolerance, 120, 10)], "x", tolerance).length,
    1,
  );
  assert.equal(
    clusterTextItemsByAxis([item("A", 0, 100, 10), item("B", tolerance + 1e-6, 120, 10)], "x", tolerance).length,
    2,
  );
});

test("vertical glyph column tolerance keeps the same partition under scale", () => {
  const original = [
    item("A", 200, 100, 16),
    item("B", 220, 120, 16),
    item("C", 241, 100, 16),
  ];
  const columns = clusterVerticalGlyphColumns(original, 16);
  const scaledColumns = clusterVerticalGlyphColumns(scaled(original, 2.5, -33, 44), 40);

  assert.deepEqual(columns.map((column) => column.items.map((entry) => entry.text)), [["C"], ["A", "B"]]);
  assert.deepEqual(
    scaledColumns.map((column) => column.items.map((entry) => entry.text)),
    columns.map((column) => column.items.map((entry) => entry.text)),
  );
});

test("glyph sequence classification survives small coordinate jitter and uniform scale", () => {
  const original = [
    item("A", 100, 100),
    item("B", 100.4, 114.1),
    item("C", 99.8, 128.2),
    item("D", 100.3, 142.1),
  ];
  assert.deepEqual(glyphSequenceRatios(original), { vertical: 1, horizontal: 0 });
  assert.deepEqual(glyphSequenceRatios(scaled(original, 2, 43, -17)), { vertical: 1, horizontal: 0 });
});

test("glyph sequence 1.5x direction boundary is strict", () => {
  const onBoundary = [item("A", 100, 100), item("B", 110, 115)];
  const justVertical = [item("A", 100, 100), item("B", 110, 115.01)];

  assert.deepEqual(glyphSequenceRatios(onBoundary), { vertical: 0, horizontal: 0 });
  assert.deepEqual(glyphSequenceRatios(justVertical), { vertical: 1, horizontal: 0 });
});

test("glyph sequence accepts equal 0.75 font ratio but rejects just below it", () => {
  const equal = [item("A", 100, 100, 14), item("B", 100, 114, 10.5)];
  const below = [item("A", 100, 100, 14), item("B", 100, 114, 10.49)];

  assert.deepEqual(glyphSequenceRatios(equal), { vertical: 1, horizontal: 0 });
  assert.deepEqual(glyphSequenceRatios(below), { vertical: 0, horizontal: 0 });
});

test("vertical layout mode keeps the inclusive 0.7 single-char boundary", () => {
  const glyphs = Array.from({ length: 7 }, (_, index) => item(String.fromCharCode(65 + index), 100, 100 + index * 14));
  const runs = [item("run-a", 200, 100), item("run-b", 220, 100), item("run-c", 240, 100)];
  const exactlySeventyPercent = [...glyphs, ...runs];
  const belowSeventyPercent = exactlySeventyPercent.map((entry, index) =>
    index === 6 ? { ...entry, text: "GG" } : entry);

  assert.equal(verticalTextLayoutMode(exactlySeventyPercent), "glyph");
  assert.equal(verticalTextLayoutMode(belowSeventyPercent), "run");
});

test("vertical overlap uses source order only strictly inside the local overlap window", () => {
  const inside = [
    item("A", 100, 100, 14, 1),
    item("B", 100, 110, 14, 0),
  ];
  const onBoundary = [
    item("A", 100, 100, 14, 1),
    item("B", 100, 110.5, 14, 0),
  ];

  assert.deepEqual(orderVerticalGlyphItems(inside).map((entry) => entry.text), ["B", "A"]);
  assert.deepEqual(orderVerticalGlyphItems(onBoundary).map((entry) => entry.text), ["A", "B"]);
});

test("vertical overlap remains geometry-first when source indexes are incomplete", () => {
  const items = [
    item("A", 100, 100, 14, 1),
    item("B", 100, 110, 14),
  ];
  assert.deepEqual(orderVerticalGlyphItems(items).map((entry) => entry.text), ["A", "B"]);
});
