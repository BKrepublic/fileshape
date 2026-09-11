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

test("joins ordinary glyph-by-glyph vertical column wraps without inventing line breaks", () => {
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
  assert.equal(result.text, "裁縫本文");
});

test("uses large inter-column gaps as logical paragraph boundaries", () => {
  const horizontalGlyphTransform = [14, 0, 0, 14, 0, 0];
  const result = reconstructPageFlow(
    page([
      item({ text: "題", displayX: 800, displayY: 100, displayTransform: horizontalGlyphTransform }),
      item({ text: "名", displayX: 800, displayY: 114, displayTransform: horizontalGlyphTransform }),
      item({ text: "本", displayX: 700, displayY: 100, displayTransform: horizontalGlyphTransform }),
      item({ text: "文", displayX: 700, displayY: 114, displayTransform: horizontalGlyphTransform }),
      item({ text: "続", displayX: 650, displayY: 100, displayTransform: horizontalGlyphTransform }),
      item({ text: "き", displayX: 650, displayY: 114, displayTransform: horizontalGlyphTransform }),
      item({ text: "次", displayX: 550, displayY: 100, displayTransform: horizontalGlyphTransform }),
      item({ text: "段", displayX: 550, displayY: 114, displayTransform: horizontalGlyphTransform }),
      item({ text: "落", displayX: 550, displayY: 128, displayTransform: horizontalGlyphTransform }),
      item({ text: "。", displayX: 556, displayY: 142, displayTransform: horizontalGlyphTransform }),
    ]),
  );

  assert.equal(result.orientation, "vertical");
  assert.equal(result.text, "題名\n本文続き\n次段落。");
});

test("keeps shifted vertical punctuation and long marks in source sequence", () => {
  const horizontalGlyphTransform = [14, 0, 0, 14, 0, 0];
  const result = reconstructPageFlow(
    page([
      item({ text: "ム", displayX: 700, displayY: 100, displayTransform: horizontalGlyphTransform }),
      item({ text: " ー", displayX: 705, displayY: 114, displayTransform: horizontalGlyphTransform }),
      item({ text: "ド", displayX: 700, displayY: 128, displayTransform: horizontalGlyphTransform }),
      item({ text: "で", displayX: 700, displayY: 142, displayTransform: horizontalGlyphTransform }),
      item({ text: "す", displayX: 700, displayY: 156, displayTransform: horizontalGlyphTransform }),
      item({ text: "。", displayX: 706, displayY: 170, displayTransform: horizontalGlyphTransform }),
    ]),
  );

  assert.equal(result.orientation, "vertical");
  assert.equal(result.text, "ムードです。");
});

test("preserves mixed vertical symbols regardless of glyph transform orientation", () => {
  const horizontal = [14, 0, 0, 14, 0, 0];
  const vertical = [0, 14, -14, 0, 0, 0];
  const result = reconstructPageFlow(
    page([
      item({ text: "縦", displayX: 700, displayY: 100, displayTransform: vertical }),
      item({ text: "書", displayX: 700, displayY: 114, displayTransform: vertical }),
      item({ text: "き", displayX: 700, displayY: 128, displayTransform: vertical }),
      item({ text: "ー", displayX: 708, displayY: 142, displayTransform: horizontal }),
      item({ text: "記", displayX: 700, displayY: 156, displayTransform: vertical }),
      item({ text: "号", displayX: 700, displayY: 170, displayTransform: vertical }),
      item({ text: "．", displayX: 707, displayY: 184, displayTransform: horizontal }),
      item({ text: "…", displayX: 696, displayY: 198, displayTransform: vertical }),
      item({ text: "終", displayX: 700, displayY: 212, displayTransform: vertical }),
    ]),
  );

  assert.equal(result.orientation, "vertical");
  assert.equal(result.text, "縦書きー記号．…終");
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
