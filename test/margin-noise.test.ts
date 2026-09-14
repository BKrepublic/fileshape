import assert from "node:assert/strict";
import test from "node:test";
import type { InspectPage, InspectTextItem } from "../src/pdf-inspection-model.js";
import { isShortMarginNoise } from "../src/margin-noise.js";

function page(height = 600): InspectPage {
  return {
    page: 1,
    width: 800,
    height,
    rotation: 0,
    userUnit: 1,
    view: [0, 0, 800, height],
    textItemCount: 0,
    imagePaintOps: 0,
    textItems: [],
  };
}

function item(overrides: Partial<InspectTextItem> = {}): InspectTextItem {
  const fontSize = overrides.fontSize ?? 12;
  return {
    text: overrides.text ?? "3",
    dir: overrides.dir ?? "ltr",
    fontName: overrides.fontName ?? "f1",
    width: overrides.width ?? fontSize,
    height: overrides.height ?? fontSize,
    transform: overrides.transform ?? [fontSize, 0, 0, fontSize, 0, 0],
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    displayTransform: overrides.displayTransform ?? [fontSize, 0, 0, fontSize, 0, 0],
    displayX: overrides.displayX ?? 400,
    displayY: overrides.displayY ?? 534,
    fontSize,
    hasEOL: overrides.hasEOL ?? false,
  };
}

test("short smaller text inside the scale-aware edge band is margin noise", () => {
  assert.equal(isShortMarginNoise(item(), page(), 14), true);
});

test("equivalent page and font scaling preserves the margin decision", () => {
  const original = isShortMarginNoise(item(), page(), 14);
  const scaled = isShortMarginNoise(
    item({ displayY: 1068, height: 24, width: 24, fontSize: 24 }),
    page(1200),
    28,
  );
  assert.equal(original, true);
  assert.equal(scaled, original);
});

test("short small text outside the edge band remains content", () => {
  assert.equal(isShortMarginNoise(item({ displayY: 480 }), page(), 14), false);
});

test("edge text is retained when it is body-sized or not short", () => {
  assert.equal(isShortMarginNoise(item({ fontSize: 14 }), page(), 14), false);
  assert.equal(isShortMarginNoise(item({ text: "123456789" }), page(), 14), false);
});
