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
