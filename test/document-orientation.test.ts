import assert from "node:assert/strict";
import test from "node:test";
import type { OrientationEvidenceSummary } from "../src/orientation-evidence.js";
import { resolveDocumentOrientations } from "../src/document-orientation.js";

function evidence(
  provisional: "vertical" | "horizontal",
  vertical: number,
  horizontal: number,
): OrientationEvidenceSummary {
  return {
    provisional,
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

test("fills a short unknown run when both surrounding pages agree", () => {
  const result = resolveDocumentOrientations([
    { page: 1, orientation: "vertical" },
    { page: 2, orientation: "unknown" },
    { page: 3, orientation: "unknown" },
    { page: 4, orientation: "vertical" },
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

test("repairs a known label when its own evidence is tied and stable neighbors agree", () => {
  const result = resolveDocumentOrientations([
    { page: 1, orientation: "vertical", evidence: evidence("vertical", 0.9, 0.1) },
    { page: 2, orientation: "horizontal", evidence: evidence("horizontal", 0.6, 0.6) },
    { page: 3, orientation: "vertical", evidence: evidence("vertical", 0.8, 0.2) },
  ]);

  assert.equal(result[1]?.detected, "horizontal");
  assert.equal(result[1]?.resolved, "vertical");
  assert.equal(result[1]?.source, "document-context");
});

test("does not label a matching ambiguous page as document-context when nothing changes", () => {
  const result = resolveDocumentOrientations([
    { page: 1, orientation: "vertical", evidence: evidence("vertical", 0.9, 0.1) },
    { page: 2, orientation: "vertical", evidence: evidence("vertical", 0.5, 0.5) },
    { page: 3, orientation: "vertical", evidence: evidence("vertical", 0.8, 0.2) },
  ]);

  assert.equal(result[1]?.resolved, "vertical");
  assert.equal(result[1]?.source, "detected");
});

test("repairs a mixed unknown and contested run only when stable neighbors agree", () => {
  const result = resolveDocumentOrientations([
    { page: 1, orientation: "vertical", evidence: evidence("vertical", 0.9, 0.1) },
    { page: 2, orientation: "unknown" },
    { page: 3, orientation: "horizontal", evidence: evidence("horizontal", 0.7, 0.7) },
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

test("does not override a known label whose retained evidence supports it", () => {
  const result = resolveDocumentOrientations([
    { page: 1, orientation: "vertical", evidence: evidence("vertical", 0.9, 0.1) },
    { page: 2, orientation: "horizontal", evidence: evidence("horizontal", 0.2, 0.8) },
    { page: 3, orientation: "vertical", evidence: evidence("vertical", 0.9, 0.1) },
  ]);

  assert.equal(result[1]?.resolved, "horizontal");
  assert.equal(result[1]?.source, "detected");
});

test("does not repair contested evidence across an orientation transition", () => {
  const result = resolveDocumentOrientations([
    { page: 10, orientation: "vertical", evidence: evidence("vertical", 0.9, 0.1) },
    { page: 11, orientation: "horizontal", evidence: evidence("horizontal", 0.5, 0.5) },
    { page: 12, orientation: "horizontal", evidence: evidence("horizontal", 0.1, 0.9) },
  ]);

  assert.equal(result[1]?.resolved, "horizontal");
  assert.equal(result[1]?.source, "detected");
});

test("does not infer across an orientation transition", () => {
  const result = resolveDocumentOrientations([
    { page: 10, orientation: "vertical" },
    { page: 11, orientation: "unknown" },
    { page: 12, orientation: "horizontal" },
  ]);

  assert.equal(result[1]?.resolved, "unknown");
  assert.equal(result[1]?.source, "unresolved");
});

test("does not guess an unknown run at a document edge", () => {
  const result = resolveDocumentOrientations([
    { page: 1, orientation: "unknown" },
    { page: 2, orientation: "unknown" },
    { page: 3, orientation: "vertical" },
  ]);

  assert.equal(result[0]?.resolved, "unknown");
  assert.equal(result[1]?.resolved, "unknown");
});

test("does not bridge an excessively long ambiguous section", () => {
  const observations = [
    { page: 1, orientation: "vertical" as const },
    ...Array.from({ length: 9 }, (_, index) => ({
      page: index + 2,
      orientation: "unknown" as const,
    })),
    { page: 11, orientation: "vertical" as const },
  ];

  const result = resolveDocumentOrientations(observations, { maxUnknownRun: 8 });
  assert.equal(result.filter((entry) => entry.source === "document-context").length, 0);
});
