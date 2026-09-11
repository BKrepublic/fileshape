import assert from "node:assert/strict";
import test from "node:test";
import type { InspectPage, InspectTextItem } from "../src/pdf-inspector.js";
import { reconstructPageFlow } from "../src/text-flow.js";

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

test("reconstructs vertical multi-character runs from right to left", () => {
  const result = reconstructPageFlow(
    page([
      item({ text: "右列", displayX: 700, displayY: 100, width: 14, height: 56 }),
      item({ text: "左列", displayX: 650, displayY: 100, width: 14, height: 56 }),
      item({ text: "るび", displayX: 711, displayY: 120, width: 7, height: 21, fontSize: 7 }),
    ]),
  );

  assert.equal(result.orientation, "vertical");
  assert.equal(result.annotationItemCount, 1);
  assert.equal(result.text, "右列\n左列");
});

test("reconstructs glyph-by-glyph vertical columns from display-coordinate sequence", () => {
  // Deliberately keep the glyph transform horizontal. Some PDFs encode glyphs
  // horizontally and rely on page rotation for visible vertical writing.
  const horizontalGlyphTransform = [14, 0, 0, 14, 0, 0];
  const result = reconstructPageFlow(
    page([
      item({ text: "裁", displayX: 700, displayY: 100, displayTransform: horizontalGlyphTransform }),
      item({ text: "縫", displayX: 700, displayY: 114, displayTransform: horizontalGlyphTransform }),
      item({ text: "本", displayX: 650, displayY: 100, displayTransform: horizontalGlyphTransform }),
      item({ text: "文", displayX: 650, displayY: 114, displayTransform: horizontalGlyphTransform }),
    ]),
  );

  assert.equal(result.orientation, "vertical");
  assert.equal(result.metrics.sequenceVerticalRatio, 1);
  assert.equal(result.text, "裁縫\n本文");
});

test("reconstructs glyph-by-glyph horizontal rows from display-coordinate sequence", () => {
  const result = reconstructPageFlow(
    page([
      item({ text: "横", displayX: 100, displayY: 100 }),
      item({ text: "書", displayX: 114, displayY: 100 }),
      item({ text: "本", displayX: 100, displayY: 140 }),
      item({ text: "文", displayX: 114, displayY: 140 }),
    ]),
  );

  assert.equal(result.orientation, "horizontal");
  assert.equal(result.metrics.sequenceHorizontalRatio, 1);
  assert.equal(result.text, "横書\n本文");
});

test("drops short smaller page-number-like margin noise", () => {
  const result = reconstructPageFlow(
    page([
      item({ text: "本文です", displayX: 700, displayY: 100, width: 14, height: 70 }),
      item({ text: "3", displayX: 400, displayY: 550, width: 7, height: 12, fontSize: 12 }),
    ]),
  );

  assert.equal(result.marginNoiseItemCount, 1);
  assert.equal(result.text, "本文です");
});
