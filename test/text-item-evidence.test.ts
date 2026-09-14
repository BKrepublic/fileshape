import assert from "node:assert/strict";
import test from "node:test";
import type { InspectPage, InspectTextItem } from "../src/pdf-inspection-model.js";
import { collectTextItemEvidence } from "../src/text-item-evidence.js";

function item(
  text: string,
  fontSize: number,
  displayY: number,
  height = fontSize,
): InspectTextItem {
  return {
    text,
    dir: "ltr",
    fontName: "F1",
    width: Math.max(fontSize, 1),
    height,
    transform: [fontSize, 0, 0, fontSize, 100, displayY],
    x: 100,
    y: displayY,
    displayTransform: [fontSize, 0, 0, fontSize, 100, displayY],
    displayX: 100,
    displayY,
    fontSize,
    hasEOL: false,
  };
}

function page(textItems: InspectTextItem[]): InspectPage {
  return {
    page: 1,
    width: 600,
    height: 800,
    rotation: 0,
    userUnit: 1,
    view: [0, 0, 600, 800],
    textItemCount: textItems.length,
    imagePaintOps: 0,
    textItems,
  };
}

test("shared text item evidence keeps margin and annotation size independent", () => {
  const evidence = collectTextItemEvidence(page([
    item("body", 10, 300),
    item("note", 7.49, 300),
    item("edge", 7, 2),
    item("equal", 7.5, 300),
    item("   ", 5, 300),
  ]), 10);

  assert.deepEqual(evidence.map((entry) => ({
    visible: entry.visible,
    marginNoise: entry.marginNoise,
    annotationSized: entry.annotationSized,
    bodySized: entry.bodySized,
  })), [
    { visible: true, marginNoise: false, annotationSized: false, bodySized: true },
    { visible: true, marginNoise: false, annotationSized: true, bodySized: false },
    { visible: true, marginNoise: true, annotationSized: true, bodySized: false },
    { visible: true, marginNoise: false, annotationSized: false, bodySized: true },
    { visible: false, marginNoise: false, annotationSized: true, bodySized: false },
  ]);
  assert.equal(evidence[1]?.bodyFontRatio, 0.749);
  assert.equal(evidence[3]?.bodyFontRatio, 0.75);

  const edge = evidence[2]?.marginEvidence;
  assert.equal(edge?.localCandidate, true);
  assert.equal(edge?.edgeSide, "top");
  assert.equal(edge?.fontRatio, 0.7);
  assert.equal(edge?.charCount, 4);
});

test("invalid or absent body font size does not invent a font-size role", () => {
  const [entry] = collectTextItemEvidence(page([item("text", 6, 300)]), 0);
  assert.equal(entry?.visible, true);
  assert.equal(entry?.annotationSized, false);
  assert.equal(entry?.bodySized, false);
  assert.equal(entry?.bodyFontRatio, undefined);
  assert.equal(entry?.marginEvidence.fontRatio, undefined);
  assert.equal(entry?.marginEvidence.localCandidate, false);
});
