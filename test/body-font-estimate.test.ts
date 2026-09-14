import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { InspectPage, InspectTextItem } from "../src/pdf-inspection-model.js";
import {
  estimateBodyFontSize,
  measureBodyFontEvidence,
  reconstructPageFlow,
} from "../src/text-flow.js";

function item(text: string, fontSize: number): InspectTextItem {
  return {
    text,
    dir: "ltr",
    fontName: `F${fontSize}`,
    width: fontSize,
    height: fontSize,
    transform: [fontSize, 0, 0, fontSize, 0, 0],
    x: 0,
    y: 0,
    displayTransform: [fontSize, 0, 0, fontSize, 0, 0],
    displayX: 0,
    displayY: 0,
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

test("compact body-font estimate matches the full flow contract", () => {
  const textItems = [
    item("heading", 20),
    item("ordinary body text ordinary body text", 14),
    item("note", 9),
  ];
  const evidence = measureBodyFontEvidence(textItems);
  const flow = reconstructPageFlow(page(textItems));

  assert.equal(evidence.size, 14);
  assert.equal(estimateBodyFontSize(textItems), 14);
  assert.equal(flow.bodyFontSize, 14);
  assert.deepEqual(flow.bodyFontEvidence, evidence);
  assert.ok(evidence.dominantSupportRatio > 0.7);
  assert.ok(evidence.dominanceMarginRatio > 0.5);
});

test("body-font evidence keeps the existing char-weighted tie behavior without hiding ambiguity", () => {
  const textItems = [item("aa", 12), item("bb", 14)];
  const evidence = measureBodyFontEvidence(textItems);

  assert.equal(estimateBodyFontSize(textItems), 14);
  assert.deepEqual(evidence, {
    size: 14,
    totalWeight: 4,
    dominantWeight: 2,
    runnerUpWeight: 2,
    dominantSupportRatio: 0.5,
    dominanceMarginRatio: 0,
    bucketCount: 2,
  });
});

test("body-font evidence is empty instead of inventing confidence without usable text", () => {
  assert.deepEqual(measureBodyFontEvidence([item("   ", 14), item("x", 0)]), {
    size: 0,
    totalWeight: 0,
    dominantWeight: 0,
    runnerUpWeight: 0,
    dominantSupportRatio: 0,
    dominanceMarginRatio: 0,
    bucketCount: 0,
  });
});

test("glyph-live ruby prepass does not execute the full page-flow pipeline", async () => {
  const source = await readFile(new URL("../src/pdf-to-epub-core.ts", import.meta.url), "utf8");
  assert.match(source, /estimateBodyFontSize\(page\.textItems\)/);
  assert.doesNotMatch(source, /\breconstructPageFlow\b/);
});
