import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  extractPdfImageResource,
  resolvePdfImageResource,
} from "../src/pdf-image-resource-adapter.js";
import { inspectPdfImages } from "../src/pdf-image-inventory.js";
import { imagePdfBytes } from "./pdf-image-fixture.js";

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function assertPng(bytes: Uint8Array): void {
  assert.deepEqual([...bytes.subarray(0, 8)], PNG_SIGNATURE);
  assert.ok(bytes.byteLength > 30);
}

test("decoded RGB and RGBA PDF.js image objects become deterministic PNG resources", async () => {
  const rgb = await extractPdfImageResource("img-rgb", {
    width: 2,
    height: 1,
    kind: 2,
    data: Uint8ClampedArray.from([255, 0, 0, 0, 255, 0]),
    interpolate: true,
  });
  assert.ok(!("status" in rgb));
  assert.equal(rgb.pixelKind, "rgb24");
  assert.equal(rgb.width, 2);
  assert.equal(rgb.height, 1);
  assert.equal(rgb.interpolate, true);
  assert.equal(rgb.decodedByteLength, 6);
  assert.equal(rgb.mediaType, "image/png");
  assertPng(rgb.bytes);

  const repeat = await extractPdfImageResource("img-rgb", {
    width: 2,
    height: 1,
    kind: 2,
    data: Uint8ClampedArray.from([255, 0, 0, 0, 255, 0]),
    interpolate: true,
  });
  assert.ok(!("status" in repeat));
  assert.equal(repeat.contentHash, rgb.contentHash);
  assert.deepEqual(repeat.bytes, rgb.bytes);

  const rgba = await extractPdfImageResource("img-rgba", {
    width: 1,
    height: 1,
    kind: 3,
    data: Uint8Array.from([1, 2, 3, 4]),
  });
  assert.ok(!("status" in rgba));
  assert.equal(rgba.pixelKind, "rgba32");
  assert.equal(rgba.decodedByteLength, 4);
  assertPng(rgba.bytes);
});

test("browser image objects without kind infer the unique supported pixel layout from decoded length", async () => {
  const data = Uint8ClampedArray.from([255, 0, 0, 0, 255, 0]);
  const explicit = await extractPdfImageResource("img-explicit", {
    width: 2,
    height: 1,
    kind: 2,
    data,
  });
  const inferred = await extractPdfImageResource("img-inferred", {
    width: 2,
    height: 1,
    data,
  });
  assert.ok(!("status" in explicit));
  assert.ok(!("status" in inferred));
  assert.equal(inferred.pixelKind, "rgb24");
  assert.equal(inferred.decodedByteLength, explicit.decodedByteLength);
  assert.equal(inferred.contentHash, explicit.contentHash);
  assert.deepEqual(inferred.bytes, explicit.bytes);

  const unresolvable = await extractPdfImageResource("img-unresolvable", {
    width: 2,
    height: 1,
    data: Uint8Array.from([1, 2, 3, 4, 5]),
  });
  assert.ok("status" in unresolvable);
  assert.equal(unresolvable.reason, "missing-image-kind-unresolvable:5");
});

test("1-bit grayscale remains packed and unsupported schemas fail closed", async () => {
  const gray = await extractPdfImageResource("img-gray", {
    width: 8,
    height: 1,
    kind: 1,
    data: Uint8Array.from([0b01010101]),
  });
  assert.ok(!("status" in gray));
  assert.equal(gray.pixelKind, "gray1");
  assert.equal(gray.decodedByteLength, 1);
  assertPng(gray.bytes);

  const wrongLength = await extractPdfImageResource("bad-length", {
    width: 2,
    height: 2,
    kind: 3,
    data: Uint8Array.from([0, 0, 0, 0]),
  });
  assert.ok("status" in wrongLength);
  assert.match(wrongLength.reason, /^decoded-length-mismatch:/);

  const bitmapOnly = await extractPdfImageResource("bitmap-only", {
    width: 1,
    height: 1,
    kind: 3,
    bitmap: {},
  });
  assert.ok("status" in bitmapOnly);
  assert.equal(bitmapOnly.reason, "bitmap-only-image-object");
});

test("pinned PDF.js real XObject is retrievable through the page object store", async () => {
  const task = getDocument({ data: new Uint8Array(imagePdfBytes()) });
  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    const operators = await page.getOperatorList();
    const index = operators.fnArray.findIndex((fn) => fn === OPS.paintImageXObject);
    assert.ok(index >= 0);
    const resourceId = operators.argsArray[index]?.[0];
    assert.equal(typeof resourceId, "string");
    const store = (page as unknown as { objs: { get(id: string): unknown } }).objs;
    const result = await resolvePdfImageResource(store, resourceId as string);
    assert.ok(!("status" in result), "real PDF image object should expose decoded data");
    assert.equal(result.width, 1);
    assert.equal(result.height, 1);
    assertPng(result.bytes);
  } finally {
    await task.destroy();
  }
});

test("image inventory hashes source bytes before PDF.js can detach them", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fileshape-image-hash-"));
  try {
    const bytes = imagePdfBytes();
    const file = path.join(directory, "fixture.pdf");
    await writeFile(file, bytes);
    const expected = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
    const report = await inspectPdfImages(file);
    assert.equal(report.pdfId, `sha256:${expected}`);
    assert.notEqual(expected, "e3b0c44298fc1c14");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
