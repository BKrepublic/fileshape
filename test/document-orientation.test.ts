import assert from "node:assert/strict";
import test from "node:test";
import { resolveDocumentOrientations } from "../src/document-orientation.js";

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
