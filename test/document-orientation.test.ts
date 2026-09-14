import assert from "node:assert/strict";
import test from "node:test";
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

test("repairs an attached-run fallback when retained tendency and stable neighbors agree", () => {
  const result = resolveDocumentOrientations([
    { page: 1, orientation: "vertical", evidence: evidence("vertical", 0.9, 0.1) },
    { page: 2, orientation: "horizontal", evidence: evidence("horizontal", 0.55, 0.45, "attached-run") },
    { page: 3, orientation: "vertical", evidence: evidence("vertical", 0.8, 0.2) },
  ]);

  assert.equal(result[1]?.detected, "horizontal");
  assert.equal(result[1]?.resolved, "vertical");
  assert.equal(result[1]?.source, "document-context");
});

test("does not label a matching attached-run fallback as document-context when nothing changes", () => {
  const result = resolveDocumentOrientations([
    { page: 1, orientation: "vertical", evidence: evidence("vertical", 0.9, 0.1) },
    { page: 2, orientation: "vertical", evidence: evidence("vertical", 0.55, 0.45, "attached-run") },
    { page: 3, orientation: "vertical", evidence: evidence("vertical", 0.8, 0.2) },
  ]);

  assert.equal(result[1]?.resolved, "vertical");
  assert.equal(result[1]?.source, "detected");
});

test("repairs a mixed unknown and attached-run fallback only when retained tendencies agree", () => {
  const result = resolveDocumentOrientations([
    { page: 1, orientation: "vertical", evidence: evidence("vertical", 0.9, 0.1) },
    { page: 2, orientation: "unknown", evidence: evidence("unknown", 0.55, 0.45, "none") },
    { page: 3, orientation: "horizontal", evidence: evidence("horizontal", 0.52, 0.48, "attached-run") },
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

test("does not repair an attached-run fallback across an orientation transition", () => {
  const result = resolveDocumentOrientations([
    { page: 10, orientation: "vertical", evidence: evidence("vertical", 0.9, 0.1) },
    { page: 11, orientation: "horizontal", evidence: evidence("horizontal", 0.55, 0.45, "attached-run") },
    { page: 12, orientation: "horizontal", evidence: evidence("horizontal", 0.1, 0.9) },
  ]);

  assert.equal(result[1]?.resolved, "horizontal");
  assert.equal(result[1]?.source, "detected");
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
    { page: 1, orientation: "unknown", evidence: evidence("unknown", 0.55, 0.45, "none") },
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

test("one opposite tendency blocks the whole ambiguous run instead of guessing through it", () => {
  const result = resolveDocumentOrientations([
    { page: 1, orientation: "vertical", evidence: evidence("vertical", 0.9, 0.1) },
    { page: 2, orientation: "unknown", evidence: evidence("unknown", 0.55, 0.45, "none") },
    { page: 3, orientation: "unknown", evidence: evidence("unknown", 0.45, 0.55, "none") },
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
