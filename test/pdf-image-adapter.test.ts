import assert from "node:assert/strict";
import test from "node:test";
import { OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractImagePaintEvidence } from "../src/pdf-image-adapter.js";

function op(name: string): number {
  const value = (OPS as Record<string, unknown>)[name];
  assert.equal(typeof value, "number", `missing PDF.js OPS.${name}`);
  return value as number;
}

test("image evidence preserves transforms, resource references, forms and clip state", () => {
  const result = extractImagePaintEvidence(3, {
    fnArray: [
      op("save"),
      op("transform"),
      op("paintImageXObject"),
      op("clip"),
      op("paintInlineImageXObject"),
      op("paintFormXObjectBegin"),
      op("paintImageXObject"),
      op("paintFormXObjectEnd"),
      op("restore"),
    ],
    argsArray: [
      [],
      [2, 0, 0, 3, 10, 20],
      ["img-1", 40, 20],
      [],
      [{ width: 2, height: 3 }],
      [[1, 0, 0, 1, 5, 7]],
      ["img-form", 10, 10],
      [],
      [],
    ],
  }, [1, 0, 0, -1, 0, 800]);

  assert.deepEqual(result.issues, []);
  assert.equal(result.paints.length, 3);

  const first = result.paints[0]!;
  assert.equal(first.kind, "xobject");
  assert.equal(first.resourceId, "img-1");
  assert.deepEqual(first.ctm, [2, 0, 0, 3, 10, 20]);
  assert.deepEqual(first.displayTransform, [2, 0, 0, -3, 10, 780]);
  assert.equal(first.clipObserved, false);
  assert.equal(first.formDepth, 0);

  const inline = result.paints[1]!;
  assert.equal(inline.kind, "inline");
  assert.equal(inline.width, 2);
  assert.equal(inline.height, 3);
  assert.equal(inline.clipObserved, true);

  const form = result.paints[2]!;
  assert.equal(form.resourceId, "img-form");
  assert.equal(form.formDepth, 1);
  assert.equal(form.clipObserved, true);
  assert.deepEqual(form.ctm, [2, 0, 0, 3, 20, 41]);
});

test("repeat paints expand occurrences and unknown group schemas remain explicit", () => {
  const result = extractImagePaintEvidence(1, {
    fnArray: [op("paintImageXObjectRepeat"), op("paintInlineImageXObjectGroup")],
    argsArray: [
      ["img-repeat", 10, 20, new Float32Array([1, 2, 3, 4])],
      [{ width: 1, height: 1 }, {}],
    ],
  }, [1, 0, 0, 1, 0, 0]);

  assert.equal(result.paints.length, 3);
  assert.deepEqual(result.paints.slice(0, 2).map((paint) => paint.occurrenceIndex), [0, 1]);
  assert.deepEqual(result.paints[0]!.ctm, [10, 0, 0, 20, 1, 2]);
  assert.deepEqual(result.paints[1]!.ctm, [10, 0, 0, 20, 3, 4]);
  assert.equal(result.paints[2]!.kind, "inline-group");
  assert.equal(result.paints[2]!.status, "unsupported-schema");
  assert.equal(result.paints[2]!.reason, "group-or-unknown-image-schema");
});
