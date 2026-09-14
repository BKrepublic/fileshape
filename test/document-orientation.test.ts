import assert from "node:assert/strict";
import test from "node:test";
import type { AttachedRunEvidence } from "../src/attached-run-evidence.js";
import type {
  OrientationDecisionSource,
  OrientationEvidenceSummary,
} from "../src/orientation-evidence.js";
import { resolveDocumentOrientations } from "../src/document-orientation.js";
import type { WritingOrientation } from "../src/text-flow.js";

function evidence(
  provisional: WritingOrientation,
  vertical: number,
  horizontal: number,
  decisionSource: OrientationDecisionSource = "run",
  singleCharItemRatio = 0,
): OrientationEvidenceSummary {
  return {
    provisional,
    decisionSource,
    singleCharItemRatio,
    vertical,
    horizontal,
    margin: Math.abs(vertical - horizontal),
    channels: {
      run: { vertical, horizontal },
      baseline: { vertical: 0, horizontal: 0 },
      sequence: { vertical: 0, horizontal: 0 },
    },
  };
}

function attached(orientation: Exclude<WritingOrientation, "unknown">): AttachedRunEvidence {
  const unsupported = { anchorCount: 0, pendingCount: 0, attachedCount: 0, complete: false };
  const supported = { anchorCount: 1, pendingCount: 1, attachedCount: 1, complete: true };
  return orientation === "vertical"
    ? { vertical: supported, horizontal: unsupported }
    : { vertical: unsupported, horizontal: supported };
}

function attachedEvidence(orientation: Exclude<WritingOrientation, "unknown">): OrientationEvidenceSummary {
  return {
    ...evidence("unknown", 0, 0, "none"),
    attachedRun: attached(orientation),
  };
}

test("fills an evidence-supported unknown run when both surrounding pages agree", () => {
  const result = resolveDocumentOrientations([
    { page: 1, orientation: "vertical", evidence: evidence("vertical", 0.9, 0.1) },
    { page: 2, orientation: "unknown", evidence: evidence("unknown", 0.55, 0.45, "none") },
    { page: 3, orientation: "unknown", evidence: evidence("unknown", 0.52, 0.48, "none") },
    { page: 4, orientation: "vertical", evidence: evidence("vertical", 0.8, 0.2) },
  ]);

  assert.deepEqual(
    result.map((entry) => [entry.page, entry.resolved, entry.source]),
    [
      [1, "vertical", "detected"],
      [2, "vertical", "document-context"],
      [3, "vertical", "document-context"],
      [4, "vertical", "detected"],
    ],
  );
});

test("resolves attached-run evidence only when stable neighbors agree", () => {
  const result = resolveDocumentOrientations([
    { page: 1, orientation: "vertical", evidence: evidence("vertical", 0.9, 0.1) },
    { page: 2, orientation: "unknown", evidence: attachedEvidence("vertical") },
    { page: 3, orientation: "vertical", evidence: evidence("vertical", 0.8, 0.2) },
  ]);

  assert.equal(result[1]?.detected, "unknown");
  assert.equal(result[1]?.resolved, "vertical");
  assert.equal(result[1]?.source, "document-context");
});

test("mixed raw tendency and attached-run evidence resolve only when both support context", () => {
  const result = resolveDocumentOrientations([
    { page: 1, orientation: "vertical", evidence: evidence("vertical", 0.9, 0.1) },
    { page: 2, orientation: "unknown", evidence: evidence("unknown", 0.55, 0.45, "none") },
    { page: 3, orientation: "unknown", evidence: attachedEvidence("vertical") },
    { page: 4, orientation: "vertical", evidence: evidence("vertical", 0.8, 0.1) },
  ]);

  assert.deepEqual(
    result.slice(1, 3).map((entry) => [entry.resolved, entry.source]),
    [
      ["vertical", "document-context"],
      ["vertical", "document-context"],
    ],
  );
});

test("does not override a metric-backed run decision when channel maxima tie", () => {
  const result = resolveDocumentOrientations([
    { page: 1, orientation: "vertical", evidence: evidence("vertical", 0.9, 0.1) },
    { page: 2, orientation: "horizontal", evidence: evidence("horizontal", 1, 1, "run") },
    { page: 3, orientation: "vertical", evidence: evidence("vertical", 0.9, 0.1) },
  ]);

  assert.equal(result[1]?.resolved, "horizontal");
  assert.equal(result[1]?.source, "detected");
});

test("does not override a known metric-backed label whose retained source decided it", () => {
  const result = resolveDocumentOrientations([
    { page: 1, orientation: "vertical", evidence: evidence("vertical", 0.9, 0.1) },
    { page: 2, orientation: "horizontal", evidence: evidence("horizontal", 0.2, 0.8, "baseline") },
    { page: 3, orientation: "vertical", evidence: evidence("vertical", 0.9, 0.1) },
  ]);

  assert.equal(result[1]?.resolved, "horizontal");
  assert.equal(result[1]?.source, "detected");
});

test("does not resolve attached-run evidence across an orientation transition", () => {
  const result = resolveDocumentOrientations([
    { page: 10, orientation: "vertical", evidence: evidence("vertical", 0.9, 0.1) },
    { page: 11, orientation: "unknown", evidence: attachedEvidence("vertical") },
    { page: 12, orientation: "horizontal", evidence: evidence("horizontal", 0.1, 0.9) },
  ]);

  assert.equal(result[1]?.resolved, "unknown");
  assert.equal(result[1]?.source, "unresolved");
});

test("does not infer across an orientation transition", () => {
  const result = resolveDocumentOrientations([
    { page: 10, orientation: "vertical", evidence: evidence("vertical", 0.9, 0.1) },
    { page: 11, orientation: "unknown", evidence: evidence("unknown", 0.55, 0.45, "none") },
    { page: 12, orientation: "horizontal", evidence: evidence("horizontal", 0.1, 0.9) },
  ]);

  assert.equal(result[1]?.resolved, "unknown");
  assert.equal(result[1]?.source, "unresolved");
});

test("does not guess an unknown run at a document edge", () => {
  const result = resolveDocumentOrientations([
    { page: 1, orientation: "unknown", evidence: attachedEvidence("vertical") },
    { page: 2, orientation: "unknown", evidence: evidence("unknown", 0.52, 0.48, "none") },
    { page: 3, orientation: "vertical", evidence: evidence("vertical", 0.9, 0.1) },
  ]);

  assert.equal(result[0]?.resolved, "unknown");
  assert.equal(result[1]?.resolved, "unknown");
});

test("does not infer an evidence-free ambiguous section even when anchors agree", () => {
  const result = resolveDocumentOrientations([
    { page: 1, orientation: "vertical" },
    { page: 2, orientation: "unknown" },
    { page: 3, orientation: "unknown" },
    { page: 4, orientation: "vertical" },
  ]);

  assert.equal(result.filter((entry) => entry.source === "document-context").length, 0);
  assert.equal(result[1]?.resolved, "unknown");
  assert.equal(result[2]?.resolved, "unknown");
});

test("fills a long ambiguous section when retained evidence consistently supports the anchors", () => {
  const observations = [
    { page: 1, orientation: "vertical" as const, evidence: evidence("vertical", 0.9, 0.1) },
    ...Array.from({ length: 20 }, (_, index) => ({
      page: index + 2,
      orientation: "unknown" as const,
      evidence: evidence("unknown", 0.55, 0.45, "none"),
    })),
    { page: 22, orientation: "vertical" as const, evidence: evidence("vertical", 0.9, 0.1) },
  ];

  const result = resolveDocumentOrientations(observations);
  assert.equal(result.filter((entry) => entry.source === "document-context").length, 20);
  assert.equal(result.filter((entry) => entry.resolved === "unknown").length, 0);
});

test("one opposite attached-run tendency blocks the whole ambiguous run", () => {
  const result = resolveDocumentOrientations([
    { page: 1, orientation: "vertical", evidence: evidence("vertical", 0.9, 0.1) },
    { page: 2, orientation: "unknown", evidence: evidence("unknown", 0.55, 0.45, "none") },
    { page: 3, orientation: "unknown", evidence: attachedEvidence("horizontal") },
    { page: 4, orientation: "vertical", evidence: evidence("vertical", 0.9, 0.1) },
  ]);

  assert.equal(result.filter((entry) => entry.source === "document-context").length, 0);
  assert.equal(result[1]?.resolved, "unknown");
  assert.equal(result[2]?.resolved, "unknown");
});

test("glyph-dominant sequence tendency can veto an opposite run tendency", () => {
  const glyphEvidence = evidence("unknown", 0.55, 0.45, "none", 0.95);
  glyphEvidence.channels.sequence = { vertical: 0.2, horizontal: 0.8 };
  glyphEvidence.vertical = 0.55;
  glyphEvidence.horizontal = 0.8;
  glyphEvidence.margin = 0.25;

  const result = resolveDocumentOrientations([
    { page: 1, orientation: "vertical", evidence: evidence("vertical", 0.9, 0.1) },
    { page: 2, orientation: "unknown", evidence: glyphEvidence },
    { page: 3, orientation: "vertical", evidence: evidence("vertical", 0.9, 0.1) },
  ]);

  assert.equal(result[1]?.resolved, "unknown");
  assert.equal(result[1]?.source, "unresolved");
});
