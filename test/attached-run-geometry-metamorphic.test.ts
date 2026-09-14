import assert from "node:assert/strict";
import test from "node:test";
import {
  attachedRunTendency,
  measureAttachedRunEvidence,
} from "../src/attached-run-evidence.js";
import { resolveDocumentOrientations } from "../src/document-orientation.js";
import type { OrientationEvidenceSummary } from "../src/orientation-evidence.js";
import type { InspectTextItem } from "../src/pdf-inspection-model.js";

function item(
  text: string,
  displayX: number,
  displayY: number,
  width: number,
  height: number,
  fontSize = 14,
): InspectTextItem {
  return {
    text,
    dir: "ltr",
    fontName: "F1",
    width,
    height,
    transform: [fontSize, 0, 0, fontSize, displayX, displayY],
    x: displayX,
    y: displayY,
    displayTransform: [fontSize, 0, 0, fontSize, displayX, displayY],
    displayX,
    displayY,
    fontSize,
    hasEOL: false,
  };
}

function verticalAttached(): InspectTextItem[] {
  return [
    item("anchor", 200, 100, 14, 84),
    item("xy", 195, 184, 11, 14),
  ];
}

function horizontalAttached(): InspectTextItem[] {
  return [
    item("anchor", 100, 200, 84, 14),
    item("xy", 184, 195, 14, 11),
  ];
}

function scaleTranslate(
  items: readonly InspectTextItem[],
  scale: number,
  dx: number,
  dy: number,
): InspectTextItem[] {
  return items.map((entry) => ({
    ...entry,
    width: entry.width * scale,
    height: entry.height * scale,
    transform: [
      entry.fontSize * scale, 0, 0, entry.fontSize * scale,
      entry.displayX * scale + dx, entry.displayY * scale + dy,
    ],
    x: entry.displayX * scale + dx,
    y: entry.displayY * scale + dy,
    displayTransform: [
      entry.fontSize * scale, 0, 0, entry.fontSize * scale,
      entry.displayX * scale + dx, entry.displayY * scale + dy,
    ],
    displayX: entry.displayX * scale + dx,
    displayY: entry.displayY * scale + dy,
    fontSize: entry.fontSize * scale,
  }));
}

for (const [name, fixture] of [
  ["vertical", verticalAttached],
  ["horizontal", horizontalAttached],
] as const) {
  test(`${name} attachment survives equivalent scale and translation`, () => {
    for (const [scale, dx, dy] of [[0.5, 37, -19], [1, 0, 0], [3, -41, 83]] as const) {
      const evidence = measureAttachedRunEvidence(scaleTranslate(fixture(), scale, dx, dy));
      assert.equal(attachedRunTendency(evidence), name);
      assert.equal(evidence[name].complete, true);
      assert.equal(evidence[name].attachedCount, 1);
    }
  });

  test(`${name} attachment survives small extraction jitter`, () => {
    const baseline = fixture();
    const crossKey = name === "vertical" ? "displayX" : "displayY";
    const inlineKey = name === "vertical" ? "displayY" : "displayX";

    for (const [crossJitter, inlineJitter] of [
      [-0.75, -1.25],
      [0.5, 0.75],
      [1.5, 2],
    ] as const) {
      const perturbed = baseline.map((entry) => ({ ...entry }));
      const compact = perturbed[1]!;
      compact[crossKey] += crossJitter;
      compact[inlineKey] += inlineJitter;
      const evidence = measureAttachedRunEvidence(perturbed);
      assert.equal(attachedRunTendency(evidence), name);
      assert.equal(evidence[name].complete, true);
    }
  });
}

test("cross-axis tolerance is inclusive at the boundary and fails closed outside it", () => {
  const onBoundary = verticalAttached();
  onBoundary[1]!.displayX = 193; // |200 - 193| = 7 = 14 * 0.5
  assert.equal(attachedRunTendency(measureAttachedRunEvidence(onBoundary)), "vertical");

  const outside = verticalAttached();
  outside[1]!.displayX = 192.99;
  assert.equal(attachedRunTendency(measureAttachedRunEvidence(outside)), "unknown");
});

test("inline-gap tolerance is inclusive at the boundary and fails closed outside it", () => {
  const onBoundary = verticalAttached();
  onBoundary[1]!.displayY = 194.5; // gap = 10.5 = 14 * 0.75
  assert.equal(attachedRunTendency(measureAttachedRunEvidence(onBoundary)), "vertical");

  const outside = verticalAttached();
  outside[1]!.displayY = 194.51;
  assert.equal(attachedRunTendency(measureAttachedRunEvidence(outside)), "unknown");
});

function stableEvidence(orientation: "vertical" | "horizontal"): OrientationEvidenceSummary {
  return {
    provisional: orientation,
    decisionSource: "run",
    singleCharItemRatio: 0,
    vertical: orientation === "vertical" ? 0.9 : 0.1,
    horizontal: orientation === "horizontal" ? 0.9 : 0.1,
    margin: 0.8,
    channels: {
      run: {
        vertical: orientation === "vertical" ? 0.9 : 0.1,
        horizontal: orientation === "horizontal" ? 0.9 : 0.1,
      },
      baseline: { vertical: 0, horizontal: 0 },
      sequence: { vertical: 0, horizontal: 0 },
    },
  };
}

test("jitter-stable attached evidence resolves only an unknown page, never a metric-backed label", () => {
  const attached = measureAttachedRunEvidence(verticalAttached());
  const attachedEvidence: OrientationEvidenceSummary = {
    provisional: "unknown",
    decisionSource: "none",
    singleCharItemRatio: 0,
    vertical: 0,
    horizontal: 0,
    margin: 0,
    channels: {
      run: { vertical: 0, horizontal: 0 },
      baseline: { vertical: 0, horizontal: 0 },
      sequence: { vertical: 0, horizontal: 0 },
    },
    attachedRun: attached,
  };

  const resolvedUnknown = resolveDocumentOrientations([
    { page: 1, orientation: "vertical", evidence: stableEvidence("vertical") },
    { page: 2, orientation: "unknown", evidence: attachedEvidence },
    { page: 3, orientation: "vertical", evidence: stableEvidence("vertical") },
  ]);
  assert.equal(resolvedUnknown[1]?.resolved, "vertical");
  assert.equal(resolvedUnknown[1]?.source, "document-context");

  const preservedKnown = resolveDocumentOrientations([
    { page: 1, orientation: "vertical", evidence: stableEvidence("vertical") },
    { page: 2, orientation: "horizontal", evidence: { ...stableEvidence("horizontal"), attachedRun: attached } },
    { page: 3, orientation: "vertical", evidence: stableEvidence("vertical") },
  ]);
  assert.equal(preservedKnown[1]?.resolved, "horizontal");
  assert.equal(preservedKnown[1]?.source, "detected");
});
