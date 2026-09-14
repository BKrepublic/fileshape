import assert from "node:assert/strict";
import test from "node:test";
import type { InspectPage, InspectTextItem } from "../src/pdf-inspector.js";
import { reconstructPhysicalLayout } from "../src/physical-layout.js";

function item(overrides: Partial<InspectTextItem> & Pick<InspectTextItem, "text">): InspectTextItem {
  return {
    text: overrides.text,
    dir: overrides.dir ?? "ltr",
    fontName: overrides.fontName ?? "f1",
    width: overrides.width ?? 14,
    height: overrides.height ?? 14,
    transform: overrides.transform ?? [14, 0, 0, 14, overrides.x ?? 0, overrides.y ?? 0],
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    displayTransform:
      overrides.displayTransform ?? [14, 0, 0, 14, overrides.displayX ?? 0, overrides.displayY ?? 0],
    displayX: overrides.displayX ?? 0,
    displayY: overrides.displayY ?? 0,
    fontSize: overrides.fontSize ?? 14,
    hasEOL: overrides.hasEOL ?? false,
  };
}

function page(items: InspectTextItem[]): InspectPage {
  return {
    page: 1,
    width: 800,
    height: 600,
    rotation: 0,
    userUnit: 1,
    view: [0, 0, 800, 600],
    textItemCount: items.length,
    imagePaintOps: 0,
    textItems: items,
  };
}

test("preserves adjacent vertical glyph columns as separate physical units", () => {
  const items = [
    item({ text: "１", displayX: 700, displayY: 100 }),
    item({ text: "．", displayX: 706, displayY: 114 }),
    item({ text: "選", displayX: 700, displayY: 128 }),
    item({ text: "択", displayX: 700, displayY: 142 }),
    item({ text: "↓", displayX: 676, displayY: 100 }),
    item({ text: "（", displayX: 676, displayY: 114 }),
    item({ text: "ア", displayX: 676, displayY: 128 }),
    item({ text: "）", displayX: 676, displayY: 142 }),
  ];

  const layout = reconstructPhysicalLayout(page(items), "vertical", 14);

  assert.deepEqual(
    layout.units.map((unit) => unit.text),
    ["１．選択", "↓（ア）"],
  );
  assert.equal(layout.gaps.length, 1);
  assert.equal(layout.gaps[0]?.distance, 24);
});

test("keeps shifted punctuation and horizontal-looking symbols in the same physical column", () => {
  const items = [
    item({ text: "ム", displayX: 700, displayY: 100 }),
    item({ text: "ー", displayX: 708, displayY: 114 }),
    item({ text: "ド", displayX: 700, displayY: 128 }),
    item({ text: "．", displayX: 707, displayY: 142 }),
  ];

  const layout = reconstructPhysicalLayout(page(items), "vertical", 14);

  assert.equal(layout.units.length, 1);
  assert.equal(layout.units[0]?.text, "ムード．");
});

test("reconstructs vertical glyph columns from geometry when PDF source order is interleaved", () => {
  const items = [
    item({ text: "縦", displayX: 700, displayY: 100 }),
    item({ text: "次", displayX: 676, displayY: 100 }),
    item({ text: "書", displayX: 700, displayY: 114 }),
    item({ text: "の", displayX: 676, displayY: 114 }),
    item({ text: "き", displayX: 700, displayY: 128 }),
    item({ text: "列", displayX: 676, displayY: 128 }),
  ];

  const layout = reconstructPhysicalLayout(page(items), "vertical", 14);

  assert.deepEqual(
    layout.units.map((unit) => unit.text),
    ["縦書き", "次の列"],
  );
  assert.deepEqual(
    layout.units.map((unit) => unit.itemCount),
    [3, 3],
  );
});

test("uses source order only for locally overlapping vertical glyph origins", () => {
  const items = [
    item({ text: "は", displayX: 700, displayY: 100 }),
    item({ text: "「", displayX: 706, displayY: 114 }),
    // The next glyph has a shifted display origin that visually precedes the
    // punctuation even though source extraction says it follows it.
    item({ text: "暁", displayX: 700, displayY: 109 }),
    item({ text: "～", displayX: 700, displayY: 128 }),
  ];

  const layout = reconstructPhysicalLayout(page(items), "vertical", 14);

  assert.equal(layout.units.length, 1);
  assert.equal(layout.units[0]?.text, "は「暁～");
  assert.deepEqual(
    layout.units[0]?.sourceRanges?.map((range) => range.itemIndex),
    [0, 1, 2, 3],
  );
});

test("large vertical separations still use geometry instead of source order", () => {
  const items = [
    item({ text: "後", displayX: 700, displayY: 160 }),
    item({ text: "先", displayX: 700, displayY: 100 }),
    item({ text: "中", displayX: 700, displayY: 130 }),
  ];

  const layout = reconstructPhysicalLayout(page(items), "vertical", 14);

  assert.equal(layout.units.length, 1);
  assert.equal(layout.units[0]?.text, "先中後");
  assert.deepEqual(
    layout.units[0]?.sourceRanges?.map((range) => range.itemIndex),
    [1, 2, 0],
  );
});

test("excludes a smaller lower-margin page number before it can merge into a body column", () => {
  const items = [
    item({ text: "本", displayX: 410, displayY: 100 }),
    item({ text: "文", displayX: 410, displayY: 114 }),
    // Mirrors N8440FE-style pagination: about 89% down the page and close
    // enough in X that it would otherwise be clustered into the body column.
    item({ text: "3", displayX: 400, displayY: 534, fontSize: 12, width: 8, height: 12 }),
  ];

  const layout = reconstructPhysicalLayout(page(items), "vertical", 14);

  assert.deepEqual(layout.units.map((unit) => unit.text), ["本文"]);
  assert.equal(layout.units[0]?.itemCount, 2);
});
