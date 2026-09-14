import assert from "node:assert/strict";
import test from "node:test";
import type { InspectPage, InspectTextItem } from "../src/pdf-inspector.js";
import { reconstructPageFlow } from "../src/text-flow.js";
import { reconstructPhysicalLayout } from "../src/physical-layout.js";
import { buildSemanticBlocks } from "../src/semantic-blocks.js";

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

function sparseRuns(horizontal = false): InspectTextItem[] {
  return [
    item({ text: "本文続き", displayX: 200, displayY: 100,
      width: horizontal ? 84 : 14, height: horizontal ? 14 : 84 }),
    item({ text: "…．", displayX: horizontal ? 284 : 195,
      displayY: horizontal ? 105 : 184, width: 11, height: 14,
      displayTransform: [0, 14, 14, 0, 0, 0] }),
  ];
}

for (const horizontal of [false, true]) {
  const orientation = horizontal ? "horizontal" : "vertical";
  test(`resolves a compact endpoint attachment from ${orientation} run geometry`, () => {
    const input = page(sparseRuns(horizontal));
    const flow = reconstructPageFlow(input);
    assert.equal(flow.orientation, orientation);
    assert.equal(flow.metrics.verticalBaselineRatio, 0.5);
    assert.equal(flow.metrics.horizontalBaselineRatio, 0.5);
    const physical = reconstructPhysicalLayout(input, flow.orientation, flow.bodyFontSize);
    assert.equal(physical.units.length, 1);
    assert.equal(buildSemanticBlocks(physical, flow.bodyFontSize).text, "本文続き…．");
  });

  test(`rejects a detached compact run beside ${orientation} text`, () => {
    for (const axis of ["displayX", "displayY"] as const) {
      const items = sparseRuns(horizontal);
      items[1]![axis] += 100;
      assert.equal(reconstructPageFlow(page(items)).orientation, "unknown");
    }
  });

  test(`rejects competing elongated runs beside ${orientation} text`, () => {
    const items = sparseRuns(horizontal);
    items[1]![horizontal ? "height" : "width"] = 84;
    assert.equal(reconstructPageFlow(page(items)).orientation, "unknown");
  });
}

test("compact runs alone do not provide a long-run anchor", () => {
  const items = sparseRuns();
  items[0]!.height = 14;
  assert.equal(reconstructPageFlow(page(items)).orientation, "unknown");
});

test("attachment inference is independent of text, page number and glyph appearance", () => {
  const items = sparseRuns();
  items[0]!.text = "arbitrary";
  items[1]!.text = "xy";
  [items[0]!.displayTransform, items[1]!.displayTransform] =
    [items[1]!.displayTransform, items[0]!.displayTransform];
  const input = { ...page(items), page: 57 };
  assert.equal(reconstructPageFlow(input).orientation, "vertical");
});

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
      item({ text: "本", displayX: 676, displayY: 100, displayTransform: horizontalGlyphTransform }),
      item({ text: "文", displayX: 676, displayY: 114, displayTransform: horizontalGlyphTransform }),
    ]),
  );

  assert.equal(result.orientation, "vertical");
  // A transition from the bottom of one physical column to the top of the next
  // can contribute one cross-axis sequence step. What matters is that vertical
  // movement remains decisively dominant, not that the ratio is exactly 1.0.
  assert.ok(result.metrics.sequenceVerticalRatio >= 0.6);
  assert.ok(result.metrics.sequenceVerticalRatio > result.metrics.sequenceHorizontalRatio);
  assert.equal(result.text, "裁縫本文");
  assert.equal(result.sourceSpacingText, "裁縫本文");
  assert.deepEqual(result.boundaries, []);
});

test("stores large inter-column gaps as spacing evidence", () => {
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
  assert.equal(result.sourceSpacingText, "題名\n\n本文続き\n\n次段落。");
  assert.deepEqual(
    result.boundaries.map((boundary) => boundary.estimatedLineBreaks),
    [2, 2],
  );
  assert.deepEqual(
    result.boundaries.map((boundary) => boundary.gapRatio),
    [2, 2],
  );
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

test("glyph-dominant pages use coordinate sequence before minority multi-character run geometry", () => {
  const glyphs = Array.from({ length: 12 }, (_, index) =>
    item({
      text: String.fromCharCode(0x41 + index),
      displayX: 700,
      displayY: 100 + index * 14,
      displayTransform: [14, 0, 0, 14, 0, 0],
    }));
  const minorityRun = item({
    text: "minority-run",
    displayX: 400,
    displayY: 300,
    width: 120,
    height: 14,
    displayTransform: [14, 0, 0, 14, 0, 0],
  });

  const result = reconstructPageFlow(page([...glyphs, minorityRun]));

  assert.ok(result.metrics.singleCharItemRatio >= 0.7);
  assert.equal(result.metrics.horizontalRunRatio, 1);
  assert.equal(result.metrics.sequenceVerticalRatio, 1);
  assert.equal(result.orientation, "vertical");
});
