import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { assertDocumentModel, validateDocumentModel } from "../src/document-model.js";
import { buildDocumentFromInspection } from "../src/pdf-document-pipeline.js";
import { inspectPdf } from "../src/pdf-inspector.js";
import { extractProductionPageImages } from "../src/pdf-production-images.js";
import { imagePdfBytes } from "./pdf-image-fixture.js";

function op(name: string): number {
  const value = (OPS as Record<string, unknown>)[name];
  assert.equal(typeof value, "number", `missing PDF.js OPS.${name}`);
  return value as number;
}

function imageObject() {
  return { width: 1, height: 1, kind: 2, data: Uint8Array.from([255, 0, 0]) };
}

function rectangularClipPath(x: number, y: number, width: number, height: number): unknown[] {
  return [
    op("endPath"),
    [new Float32Array([
      0, x, y,
      1, x + width, y,
      1, x + width, y + height,
      1, x, y + height,
      4,
    ])],
    [x, y, x + width, y + height],
  ];
}

test("production inspection deduplicates PNG content while preserving every XObject occurrence", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fileshape-production-images-"));
  try {
    const input = path.join(directory, "fixture.pdf");
    await writeFile(input, imagePdfBytes({ includeInline: false, rotation: 0 }));
    const inspection = await inspectPdf(input, { includeImages: true });

    assert.equal(inspection.imageResources?.length, 1);
    assert.equal(inspection.pages[0]?.imageOccurrences?.length, 3);
    assert.equal(new Set(inspection.pages[0]?.imageOccurrences?.map((item) => item.resourceId)).size, 1);
    assert.deepEqual(
      inspection.pages[0]?.imageOccurrences?.map((item) => [item.operatorIndex, item.occurrenceIndex]),
      [[5, 0], [9, 0], [16, 0]],
    );

    const { document } = buildDocumentFromInspection(inspection, "fixture:production-images");
    assertDocumentModel(document);
    assert.equal(document.imageResources.length, 1);
    assert.equal(document.pages[0]?.imageOccurrences.length, 3);

    const originalByte = document.imageResources[0]!.bytes[0];
    inspection.imageResources![0]!.bytes[0] = originalByte === 0 ? 1 : 0;
    inspection.pages[0]!.imageOccurrences![0]!.displayTransform[0] = 999;
    assert.equal(document.imageResources[0]!.bytes[0], originalByte);
    assert.notEqual(document.pages[0]!.imageOccurrences[0]!.displayTransform[0], 999);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("production image boundary fails closed for inline, cropped, complex and unresolved resources", () => {
  const store = { get: (id: string) => id === "missing" ? undefined : imageObject() };
  const viewport = [1, 0, 0, 1, 0, 0];

  assert.throws(() => extractProductionPageImages(1, {
    fnArray: [op("paintInlineImageXObject")],
    argsArray: [[imageObject()]],
  }, viewport, store), /unsupported production image kind: inline/);

  assert.throws(() => extractProductionPageImages(1, {
    fnArray: [op("clip"), op("constructPath"), op("paintImageXObject")],
    argsArray: [[], rectangularClipPath(0, 0, 0.5, 1), ["image", 1, 1]],
  }, viewport, store), /unsupported clip: exact-rect\/crops-image/);

  assert.throws(() => extractProductionPageImages(1, {
    fnArray: [op("clip"), op("constructPath"), op("paintImageXObject")],
    argsArray: [[], [op("endPath"), [new Float32Array([0, 0, 0, 1, 1, 1])], [0, 0, 1, 1]], ["image", 1, 1]],
  }, viewport, store), /unsupported clip: complex-or-unknown\/unknown/);

  assert.throws(() => extractProductionPageImages(1, {
    fnArray: [op("paintImageXObject")],
    argsArray: [["missing", 1, 1]],
  }, viewport, store), /resource extraction failed: image-object-not-object/);
});

test("content dedupe retains per-occurrence interpolation evidence", () => {
  const result = extractProductionPageImages(1, {
    fnArray: [op("paintImageXObject"), op("paintImageXObject")],
    argsArray: [["plain", 1, 1], ["smooth", 1, 1]],
  }, [1, 0, 0, 1, 0, 0], {
    get: (id: string) => ({ ...imageObject(), interpolate: id === "smooth" }),
  });

  assert.equal(result.resources.length, 1);
  assert.deepEqual(result.occurrences.map((occurrence) => occurrence.interpolate), [false, true]);
});

test("document validation rejects image byte, identity, occurrence and clip corruption", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fileshape-production-image-model-"));
  try {
    const input = path.join(directory, "fixture.pdf");
    await writeFile(input, imagePdfBytes({ includeInline: false, rotation: 0 }));
    const inspection = await inspectPdf(input, { includeImages: true });
    const { document } = buildDocumentFromInspection(inspection, "fixture:image-validation");

    const bytes = document.imageResources[0]!.bytes;
    assert.ok(bytes.byteLength > 0);
    bytes[0] = bytes[0]! ^ 1;
    document.pages[0]!.imageOccurrences[0]!.resourceId = "missing";
    document.pages[0]!.imageOccurrences[1]!.operatorIndex = document.pages[0]!.imageOccurrences[0]!.operatorIndex;
    document.pages[0]!.imageOccurrences[1]!.occurrenceIndex = document.pages[0]!.imageOccurrences[0]!.occurrenceIndex;
    (document.pages[0]!.imageOccurrences[2] as { clipCoverage: string }).clipCoverage = "crops-image";

    const errors = validateDocumentModel(document);
    assert.ok(errors.some((error) => error.includes("bytes do not match content hash")));
    assert.ok(errors.some((error) => error.includes("references missing resource")));
    assert.ok(errors.some((error) => error.includes("duplicate image occurrence source")));
    assert.ok(errors.some((error) => error.includes("unsupported clip state")));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
