import assert from "node:assert/strict";
import test from "node:test";
import { OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractMarkedContentEvidence } from "../src/pdf-marked-content-inventory.js";

test("marked-content evidence keeps tag identity without property values", () => {
  const operators = {
    fnArray: [
      OPS.beginMarkedContent,
      OPS.beginMarkedContentProps,
      OPS.markPointProps,
      OPS.endMarkedContent,
      OPS.endMarkedContent,
    ],
    argsArray: [
      ["Span"],
      ["SpecialEffect", { secret: "do-not-copy" }],
      ["Artifact", { Type: "Pagination" }],
      [],
      [],
    ],
  };
  const result = extractMarkedContentEvidence(3, operators);
  assert.deepEqual(result.issues, []);
  assert.equal(result.maxDepth, 2);
  assert.deepEqual(result.occurrences.map(({ kind, tag, depth, propertyShape }) => ({ kind, tag, depth, propertyShape })), [
    { kind: "begin", tag: "Span", depth: 0, propertyShape: undefined },
    { kind: "begin-props", tag: "SpecialEffect", depth: 1, propertyShape: "object" },
    { kind: "point-props", tag: "Artifact", depth: 2, propertyShape: "object" },
  ]);
  assert.doesNotMatch(JSON.stringify(result), /do-not-copy|Pagination/);
});

test("marked-content evidence reports unbalanced wrapper state", () => {
  const underflow = extractMarkedContentEvidence(1, {
    fnArray: [OPS.endMarkedContent],
    argsArray: [[]],
  });
  assert.deepEqual(underflow.issues, ["operator-0:marked-content-end-underflow"]);

  const open = extractMarkedContentEvidence(1, {
    fnArray: [OPS.beginMarkedContent],
    argsArray: [["Span"]],
  });
  assert.deepEqual(open.issues, ["marked-content-stack-not-empty:1"]);
});
