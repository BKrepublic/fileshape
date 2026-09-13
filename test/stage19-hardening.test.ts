import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { nodeBinaryRuntime } from "../src/binary-runtime-node.js";
import type { DocumentImageOccurrence, FileShapeDocument } from "../src/document-model.js";
import { validateEpubImagePackage } from "../src/epub-image-package-validation.js";
import { serializeEpubPackage } from "../src/epub-package.js";
import { serializeEpubXhtml } from "../src/epub-xhtml.js";
import { extractProductionPageImages, PRODUCTION_IMAGE_LIMITS } from "../src/pdf-production-images.js";
import { assignImagePlacements, validateImageDisplayTransform } from "../src/production-image-placement.js";

function op(name: string): number {
  const value = (OPS as Record<string, unknown>)[name];
  assert.equal(typeof value, "number", `missing OPS.${name}`);
  return value as number;
}

function imageObject(options: { width?: number; height?: number; interpolate?: boolean } = {}) {
  const width = options.width ?? 1;
  const height = options.height ?? 1;
  return {
    width,
    height,
    kind: 2,
    data: new Uint8Array(width * height * 3),
    interpolate: options.interpolate === true,
  };
}

function productionImage(
  fnArray: number[],
  argsArray: unknown[][],
  object: ReturnType<typeof imageObject> = imageObject(),
) {
  return extractProductionPageImages(
    1,
    { fnArray, argsArray },
    [1, 0, 0, -1, 0, 1],
    { get: () => object },
    nodeBinaryRuntime,
  );
}

function occurrence(
  operatorIndex: number,
  left: number,
  top: number,
  width: number,
  height: number,
): DocumentImageOccurrence {
  return {
    kind: "image",
    sourcePage: 1,
    operatorIndex,
    occurrenceIndex: 0,
    placementIndex: 0,
    resourceId: "image-test",
    displayTransform: [width, 0, 0, -height, left, top + height],
    displayBounds: { left, top, right: left + width, bottom: top + height },
    formDepth: 0,
    interpolate: false,
    clipStatus: "none",
    clipCoverage: "none",
  };
}

function imageDocument(interpolate = false): FileShapeDocument {
  const bytes = Uint8Array.from([1, 2, 3, 4]);
  const hash = createHash("sha256").update(bytes).digest("hex");
  return {
    kind: "document",
    id: "stage19-hardening",
    source: { documentId: "stage19-hardening", pages: [{ page: 1, textItems: [] }] },
    imageResources: [{
      id: `image-${hash}`,
      contentHash: hash,
      mediaType: "image/png",
      extension: "png",
      width: 1,
      height: 1,
      pixelKind: "rgb24",
      decodedByteLength: 3,
      bytes,
    }],
    pages: [{
      kind: "page",
      sourcePage: 1,
      rotation: 0,
      orientation: "unknown",
      blocks: [],
      imageOccurrences: [{
        ...occurrence(1, 0, 0, 1, 1),
        resourceId: `image-${hash}`,
        interpolate,
      }],
      unresolvedRuby: [],
      unmappedExactRuby: [],
    }],
  };
}

test("production images reject non-default PDF compositing state", async () => {
  for (const [state, pattern] of [
    [["ca", 0.5], /unsupported fill alpha/],
    [["BM", "multiply"], /unsupported blend mode/],
    [["SMask", true], /unsupported soft mask/],
    [["TR", [1, 2, 3]], /unsupported transfer map/],
  ] as Array<[unknown[], RegExp]>) {
    await assert.rejects(() => productionImage(
      [op("setGState"), op("paintImageXObject")],
      [[[state]], ["image", 1, 1]],
    ), pattern);
  }

  const accepted = await productionImage(
    [op("setGState"), op("paintImageXObject")],
    [[[ ["ca", 1], ["BM", "source-over"], ["SMask", false], ["TR", null] ]], ["image", 1, 1]],
  );
  assert.equal(accepted.occurrences.length, 1);
});

test("production images reject non-uniform display scaling", async () => {
  await assert.rejects(() => productionImage(
    [op("transform"), op("paintImageXObject")],
    [[2, 0, 0, 1, 0, 0], ["image", 1, 1]],
  ), /unsupported non-uniform image scaling/);
});

test("production image limits are enforced before PNG construction", async () => {
  const oversized = imageObject({ width: PRODUCTION_IMAGE_LIMITS.maxWidth + 1, height: 1 });
  await assert.rejects(() => productionImage(
    [op("paintImageXObject")],
    [["image", oversized.width, oversized.height]],
    oversized,
  ), /production image limit width exceeded/);
});

test("placement rejects layered image overlap", () => {
  const left = occurrence(1, 0, 0, 20, 20);
  const right = occurrence(2, 10, 10, 20, 20);
  assert.throws(() => assignImagePlacements(
    { orientation: "unknown", inlineSize: 100, units: [], gaps: [] },
    [],
    [left, right],
  ), /layered image compositing is unsupported/);
});

test("model-level transform validation cross-checks bounds and clip geometry", () => {
  const mismatch = occurrence(1, 0, 0, 10, 10);
  mismatch.displayBounds.right = 11;
  assert.match(validateImageDisplayTransform(mismatch) ?? "", /inconsistent with display transform/);

  const clipped = occurrence(2, 0, 0, 10, 10);
  clipped.clipStatus = "exact-rect";
  clipped.clipCoverage = "contains-image";
  clipped.clipRect = { left: 0, top: 0, right: 5, bottom: 10 };
  assert.match(validateImageDisplayTransform(clipped) ?? "", /does not contain display bounds/);

  const stray = occurrence(3, 0, 0, 10, 10);
  stray.clipRect = { left: 0, top: 0, right: 10, bottom: 10 };
  assert.match(validateImageDisplayTransform(stray) ?? "", /clipRect while clipStatus=none/);
});

test("interpolated PDF image occurrences fail closed at EPUB rendering", () => {
  assert.throws(() => serializeEpubXhtml(imageDocument(true)), /unsupported PDF image interpolation/);
});

test("EPUB image package validator cross-checks XHTML, OPF and ZIP resources", () => {
  const epub = serializeEpubPackage(imageDocument(false), {
    title: "Stage 19 hardening",
    modified: "2026-09-12T00:00:00Z",
  });
  const validation = validateEpubImagePackage(epub.bytes);
  assert.deepEqual(validation.issues, []);
  assert.equal(validation.occurrenceCount, 1);
  assert.equal(validation.resourceCount, 1);
  assert.equal(validation.resourceHashes.length, 1);
});
