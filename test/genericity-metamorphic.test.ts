import assert from "node:assert/strict";
import test from "node:test";
import type { InspectPage, InspectTextItem } from "../src/pdf-inspector.js";
import { reconstructPhysicalLayout } from "../src/physical-layout.js";
import { buildSemanticBlocks } from "../src/semantic-blocks.js";
import { reconstructPageFlow } from "../src/text-flow.js";

function item(
  text: string,
  displayX: number,
  displayY: number,
  width: number,
  height: number,
  fontSize = 14,
  fontName = "body-a",
): InspectTextItem {
  return {
    text,
    dir: "ltr",
    fontName,
    width,
    height,
    transform: [0, fontSize, -fontSize, 0, displayX, displayY],
    x: displayX,
    y: displayY,
    displayTransform: [0, fontSize, -fontSize, 0, displayX, displayY],
    displayX,
    displayY,
    fontSize,
    hasEOL: false,
  };
}

function page(items: InspectTextItem[], width = 800, height = 600): InspectPage {
  return {
    page: 1,
    width,
    height,
    rotation: 0,
    userUnit: 1,
    view: [0, 0, width, height],
    textItemCount: items.length,
    imagePaintOps: 0,
    textItems: items,
  };
}

function basePage(): InspectPage {
  return page([
    item("AB", 700, 100, 14, 28),
    item("CD", 670, 100, 14, 28),
    item("xy", 711, 105, 7, 14, 7, "annotation-a"),
  ]);
}

function mapGeometry(
  source: InspectPage,
  transform: (x: number, y: number) => [number, number],
  scale: number,
  width: number,
  height: number,
  fontName?: string,
): InspectPage {
  const textItems = source.textItems.map((sourceItem) => {
    const [displayX, displayY] = transform(sourceItem.displayX, sourceItem.displayY);
    const fontSize = sourceItem.fontSize * scale;
    return {
      ...sourceItem,
      fontName: fontName ?? sourceItem.fontName,
      width: sourceItem.width * scale,
      height: sourceItem.height * scale,
      x: displayX,
      y: displayY,
      displayX,
      displayY,
      fontSize,
      transform: [0, fontSize, -fontSize, 0, displayX, displayY],
      displayTransform: [0, fontSize, -fontSize, 0, displayX, displayY],
    };
  });
  return page(textItems, width, height);
}

function semanticSignature(source: InspectPage) {
  const flow = reconstructPageFlow(source);
  const layout = reconstructPhysicalLayout(source, flow.orientation, flow.bodyFontSize);
  const semantic = buildSemanticBlocks(layout, flow.bodyFontSize);
  return {
    orientation: flow.orientation,
    flowText: flow.text,
    semanticText: semantic.text,
    blocks: semantic.blocks.map((block) => block.text),
    annotationItems: flow.annotationItemCount,
  };
}

test("uniform coordinate and font scaling preserves semantic reconstruction", () => {
  const source = basePage();
  const expected = semanticSignature(source);

  for (const scale of [0.75, 1.4]) {
    const transformed = mapGeometry(
      source,
      (x, y) => [x * scale, y * scale],
      scale,
      source.width * scale,
      source.height * scale,
    );
    assert.deepEqual(semanticSignature(transformed), expected);
  }
});

test("page-size and margin translation do not change body semantics", () => {
  const source = basePage();
  const transformed = mapGeometry(
    source,
    (x, y) => [x + 90, y + 55],
    1,
    1000,
    760,
  );

  assert.deepEqual(semanticSignature(transformed), semanticSignature(source));
});

test("font-family substitution preserves structure when geometry and style roles are equivalent", () => {
  const source = basePage();
  const transformed = mapGeometry(source, (x, y) => [x, y], 1, source.width, source.height, "replacement-family");

  assert.deepEqual(semanticSignature(transformed), semanticSignature(source));
});

test("equivalent single-glyph and multi-glyph emission preserves vertical text order", () => {
  const runPage = page([
    item("AB", 700, 100, 14, 28),
    item("CD", 670, 100, 14, 28),
  ]);
  const glyphPage = page([
    item("A", 700, 100, 14, 14),
    item("B", 700, 114, 14, 14),
    item("C", 670, 100, 14, 14),
    item("D", 670, 114, 14, 14),
  ]);

  assert.deepEqual(semanticSignature(glyphPage), semanticSignature(runPage));
});
