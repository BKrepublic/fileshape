import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { DocumentImageOccurrence, DocumentTextBlock, FileShapeDocument } from "../src/document-model.js";
import { serializeEpubPackage } from "../src/epub-package.js";
import { serializeEpubXhtml } from "../src/epub-xhtml.js";
import { assignImagePlacements } from "../src/production-image-placement.js";
import { PRODUCTION_IMAGE_LIMITS, validateProductionImageLimits } from "../src/pdf-production-images.js";
import { convertPdfToEpub } from "../src/pdf-to-epub.js";
import { imagePdfBytes } from "./pdf-image-fixture.js";
import { pdfBytes } from "./pdf-fixture.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const imageBytes = Uint8Array.from([1, 2, 3, 4]);
const imageHash = createHash("sha256").update(imageBytes).digest("hex");

function localEntries(bytes: Uint8Array): Map<string, Uint8Array> {
  const entries = new Map<string, Uint8Array>();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    entries.set(name, bytes.slice(dataStart, dataStart + size));
    offset = dataStart + size;
  }
  return entries;
}

function occurrence(operatorIndex: number, bounds: DocumentImageOccurrence["displayBounds"]): DocumentImageOccurrence {
  return {
    kind: "image", sourcePage: 1, operatorIndex, occurrenceIndex: 0, placementIndex: 0,
    resourceId: `image-${imageHash}`, displayTransform: [1, 0, 0, -1, bounds.left, bounds.bottom],
    displayBounds: bounds, formDepth: 0, interpolate: false, clipStatus: "none", clipCoverage: "none",
  };
}

function block(index: number, unitIndexes: number[], text: string): DocumentTextBlock {
  return {
    kind: "text", sourcePage: 1, semanticBlockIndex: index, unitIndexes, semanticText: text,
    sourceRanges: [{ page: 1, itemIndex: index, charStart: 0, charEnd: text.length }],
    inlines: [{ kind: "text", text, sourceRanges: [{ page: 1, itemIndex: index, charStart: 0, charEnd: text.length }] }],
  };
}

function resource() {
  return { id: `image-${imageHash}`, contentHash: imageHash, mediaType: "image/png" as const, extension: "png" as const, width: 4, height: 1, pixelKind: "rgba32" as const, decodedByteLength: 16, bytes: imageBytes };
}

function documentFixture(): FileShapeDocument {
  return {
    kind: "document", id: "image-fixture", imageResources: [resource()],
    source: { documentId: "image-fixture", pages: [{ page: 1, textItems: [{ itemIndex: 0, text: "A" }, { itemIndex: 1, text: "B" }] }] },
    pages: [{ kind: "page", sourcePage: 1, rotation: 0, orientation: "horizontal", blocks: [block(0, [0], "A"), block(1, [1], "B")],
      imageOccurrences: [occurrence(10, { left: 10, top: 10, right: 20, bottom: 20 }), occurrence(11, { left: 30, top: 150, right: 40, bottom: 200 })], unresolvedRuby: [], unmappedExactRuby: [] }],
  };
}

test("assigns unique horizontal gaps from all referenced unit positions and preserves source occurrences", () => {
  const document = documentFixture();
  const placed = assignImagePlacements({ orientation: "horizontal", inlineSize: 400, units: [
    { index: 0, position: 100, itemCount: 1, text: "A", inlineStart: 0, inlineEnd: 1, inlineSpan: 1, inlineStartRatio: 0, inlineEndRatio: 0, inlineCoverageRatio: 0 },
    { index: 1, position: 300, itemCount: 1, text: "B", inlineStart: 0, inlineEnd: 1, inlineSpan: 1, inlineStartRatio: 0, inlineEndRatio: 0, inlineCoverageRatio: 0 },
  ], gaps: [] }, document.pages[0]!.blocks, document.pages[0]!.imageOccurrences);
  assert.deepEqual(placed.map((item) => item.placementIndex), [0, 1]);
  assert.deepEqual(placed.map((item) => item.operatorIndex), [10, 11]);
});

test("fails closed for boundary ambiguity and non axis-aligned or mirrored transforms", () => {
  const document = documentFixture();
  const layout = { orientation: "horizontal" as const, inlineSize: 400, units: [{ index: 0, position: 10, itemCount: 1, text: "A", inlineStart: 0, inlineEnd: 1, inlineSpan: 1, inlineStartRatio: 0, inlineEndRatio: 0, inlineCoverageRatio: 0 }], gaps: [] };
  assert.throws(() => assignImagePlacements(layout, document.pages[0]!.blocks.slice(0, 1), [occurrence(1, { left: 0, top: 9.9999999, right: 10, bottom: 20 })]), /ambiguous placement geometry/);
  const mirrored = occurrence(2, { left: 0, top: 0, right: 10, bottom: 10 });
  mirrored.displayTransform = [1, 0, 0, 1, 0, 0];
  assert.throws(() => assignImagePlacements(layout, [], [mirrored]), /unsupported display transform/);
  for (const transform of [[0, 1, 1, 0, 0, 0], [-1, 0, 0, 1, 0, 0], [1, 0.1, 0, -1, 0, 0]] as number[][]) {
    const rejected = occurrence(3, { left: 0, top: 0, right: 10, bottom: 10 });
    rejected.displayTransform = transform;
    assert.throws(() => assignImagePlacements(layout, [], [rejected]), /unsupported display transform/);
  }
  const accepted = occurrence(4, { left: 0, top: 0, right: 10, bottom: 10 });
  assert.equal(assignImagePlacements(layout, [], [accepted])[0]!.placementIndex, 0);
});

test("model validation and serialization reject a tampered unsupported image transform", () => {
  const document = documentFixture();
  document.pages[0]!.imageOccurrences[0]!.displayTransform = [0, 1, 1, 0, 0, 0];
  assert.throws(() => serializeEpubXhtml(document), /unsupported display transform/);
  const pixelKindTampered = documentFixture();
  (pixelKindTampered.imageResources[0] as { pixelKind: string }).pixelKind = "indexed";
  assert.throws(() => serializeEpubXhtml(pixelKindTampered), /unsupported production image pixel kind: indexed/);
});

test("central production limits report measured values and occurrence provenance", () => {
  const oversized = { id: "image-x", width: PRODUCTION_IMAGE_LIMITS.maxWidth + 1, height: 1, pixelKind: "rgb24" as const, decodedByteLength: 3, bytes: imageBytes };
  assert.throws(() => validateProductionImageLimits([oversized], [{ resourceId: "image-x", sourcePage: 3, operatorIndex: 4, occurrenceIndex: 5 }]), /width.*actual 8193.*limit 8192.*page 3 operator 4 occurrence 5/);
  const mismatch = { id: "image-mismatch", width: 2, height: 1, pixelKind: "rgb24" as const, decodedByteLength: 4, bytes: imageBytes };
  assert.throws(() => validateProductionImageLimits([mismatch], []), /decoded byte length mismatch.*actual 4.*expected 6/);
  const unknownKind = { id: "image-unknown-kind", width: 1, height: 1, pixelKind: "indexed" as never, decodedByteLength: 4, bytes: imageBytes };
  assert.throws(() => validateProductionImageLimits([unknownKind], []), /unsupported production image pixel kind: indexed/);
  const tooManyOccurrences = Array.from({ length: PRODUCTION_IMAGE_LIMITS.maxOccurrences + 1 }, (_, index) => ({ resourceId: "image-x", sourcePage: 1, operatorIndex: index, occurrenceIndex: 0 }));
  assert.throws(() => validateProductionImageLimits([oversized], tooManyOccurrences), /image occurrences\/document/);
  const occurrenceResource = { id: "image-one", width: 1, height: 1, pixelKind: "rgb24" as const, decodedByteLength: 3, bytes: imageBytes };
  const tooMany = Array.from({ length: PRODUCTION_IMAGE_LIMITS.maxOccurrences + 1 }, (_, index) => ({ resourceId: "image-one", sourcePage: 1, operatorIndex: index, occurrenceIndex: 0 }));
  assert.throws(() => validateProductionImageLimits([occurrenceResource], tooMany), /image occurrences\/document.*actual 10001.*limit 10000.*page 1 operator 10000/);
  const tooManyResources = Array.from({ length: PRODUCTION_IMAGE_LIMITS.maxUniqueResources + 1 }, (_, index) => ({ id: `image-${index}`, width: 1, height: 1, pixelKind: "rgb24" as const, decodedByteLength: 3, bytes: imageBytes }));
  assert.throws(() => validateProductionImageLimits(tooManyResources, []), /unique resources\/document.*actual 4097.*limit 4096/);
  const decodedOverflow = Array.from({ length: 6 }, (_, index) => ({ id: `image-large-${index}`, width: 8192, height: 4096, pixelKind: "rgb24" as const, decodedByteLength: 8192 * 4096 * 3, bytes: imageBytes }));
  assert.throws(() => validateProductionImageLimits(decodedOverflow, []), /decoded bytes\/document.*actual 603979776.*limit 536870912/);
});

test("XHTML and OPF/ZIP retain ordered duplicate occurrences with one PNG resource", () => {
  const document = documentFixture();
  const placed = assignImagePlacements({ orientation: "horizontal", inlineSize: 400, units: [
    { index: 0, position: 100, itemCount: 1, text: "A", inlineStart: 0, inlineEnd: 1, inlineSpan: 1, inlineStartRatio: 0, inlineEndRatio: 0, inlineCoverageRatio: 0 },
    { index: 1, position: 300, itemCount: 1, text: "B", inlineStart: 0, inlineEnd: 1, inlineSpan: 1, inlineStartRatio: 0, inlineEndRatio: 0, inlineCoverageRatio: 0 },
  ], gaps: [] }, document.pages[0]!.blocks, document.pages[0]!.imageOccurrences);
  document.pages[0]!.imageOccurrences = placed;
  const xhtml = serializeEpubXhtml(document).pages[0]!.xhtml;
  assert.ok(xhtml.indexOf("data-operator-index=\"10\"") < xhtml.indexOf("data-operator-index=\"11\""));
  assert.ok(xhtml.indexOf("data-operator-index=\"10\"") < xhtml.indexOf("data-semantic-block=\"0\""));
  assert.match(xhtml, /width="4" height="1" alt="Source image from page 1"/);
  const epub = serializeEpubPackage(document, { title: "Image", modified: "2026-09-12T00:00:00Z" });
  assert.equal(epub.files.filter((file) => file.mediaType === "image/png").length, 1);
  const opf = decoder.decode(epub.files.find((file) => file.path === "OEBPS/package.opf")!.data);
  assert.match(opf, new RegExp(`id="image-${imageHash}"[^>]*href="images/${imageHash}\\.png"`));
  assert.equal(epub.files.filter((file) => file.path.endsWith(`${imageHash}.png`)).length, 1);
});

test("image-only and blank pages retain distinct page classes", () => {
  const document = documentFixture();
  document.pages[0]!.blocks = [];
  document.pages[0]!.imageOccurrences.forEach((item) => { item.placementIndex = 0; });
  document.source.pages.push({ page: 2, textItems: [] });
  document.pages.push({ kind: "page", sourcePage: 2, rotation: 0, orientation: "horizontal", blocks: [], imageOccurrences: [], unresolvedRuby: [], unmappedExactRuby: [] });
  const pages = serializeEpubXhtml(document).pages;
  assert.match(pages[0]!.xhtml, /fileshape-page-has-images/);
  assert.doesNotMatch(pages[0]!.xhtml, /fileshape-page-blank/);
  assert.match(pages[1]!.xhtml, /fileshape-page-blank/);
});

test("vertical same-gap images use right descending then top ascending order", () => {
  const document = documentFixture();
  document.pages[0]!.orientation = "vertical";
  const images = [occurrence(10, { left: 150, top: 20, right: 210, bottom: 30 }), occurrence(11, { left: 150, top: 10, right: 220, bottom: 20 })];
  const layout = { orientation: "vertical" as const, inlineSize: 400, units: [
    { index: 0, position: 300, itemCount: 1, text: "A", inlineStart: 0, inlineEnd: 1, inlineSpan: 1, inlineStartRatio: 0, inlineEndRatio: 0, inlineCoverageRatio: 0 },
    { index: 1, position: 100, itemCount: 1, text: "B", inlineStart: 0, inlineEnd: 1, inlineSpan: 1, inlineStartRatio: 0, inlineEndRatio: 0, inlineCoverageRatio: 0 },
  ], gaps: [] };
  document.pages[0]!.imageOccurrences = assignImagePlacements(layout, document.pages[0]!.blocks, images);
  assert.deepEqual(document.pages[0]!.imageOccurrences.map((item) => item.placementIndex), [1, 1]);
  const xhtml = serializeEpubXhtml(document).pages[0]!.xhtml;
  assert.ok(xhtml.indexOf("data-operator-index=\"11\"") < xhtml.indexOf("data-operator-index=\"10\""));
});

test("unknown image-only pages retain source operator order", () => {
  const document = documentFixture();
  document.pages[0]!.orientation = "unknown";
  document.pages[0]!.blocks = [];
  const images = [occurrence(10, { left: 0, top: 100, right: 10, bottom: 110 }), occurrence(11, { left: 0, top: 10, right: 10, bottom: 20 })];
  document.pages[0]!.imageOccurrences = assignImagePlacements({ orientation: "unknown", inlineSize: 400, units: [], gaps: [] }, [], images);
  const xhtml = serializeEpubXhtml(document).pages[0]!.xhtml;
  assert.ok(xhtml.indexOf("data-operator-index=\"10\"") < xhtml.indexOf("data-operator-index=\"11\""));
});

test("converter includes production images and preserves existing output on pre-write failure", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fileshape-stage19-"));
  try {
    const input = path.join(directory, "fixture.pdf");
    const imageInput = path.join(directory, "image.pdf");
    const output = path.join(directory, "image.epub");
    await writeFile(input, pdfBytes());
    await writeFile(imageInput, imagePdfBytes({ includeInline: false, rotation: 0 }));
    const original = encoder.encode("keep");
    await writeFile(output, original);
    await assert.rejects(() => convertPdfToEpub(input, output, { title: "", modified: "2026-09-12T00:00:00Z" }), /title must not be empty/);
    assert.deepEqual(new Uint8Array(await readFile(output)), original);
    const failedOutput = path.join(directory, "failed.epub");
    await mkdir(failedOutput);
    await assert.rejects(() => convertPdfToEpub(input, failedOutput, { title: "Image", modified: "2026-09-12T00:00:00Z" }));
    assert.equal((await readdir(directory)).filter((entry) => entry.startsWith(".failed.epub.") && entry.endsWith(".tmp")).length, 0);
    await convertPdfToEpub(imageInput, output, { title: "Image", modified: "2026-09-12T00:00:00Z", unresolvedRubyPolicy: "preserve-as-page-note" });
    const bytes = new Uint8Array(await readFile(output));
    assert.notDeepEqual(bytes, original);
    const entries = localEntries(bytes);
    const imagePaths = [...entries.keys()].filter((entry) => /^OEBPS\/images\/[0-9a-f]{64}\.png$/.test(entry));
    assert.equal(imagePaths.length, 1);
    assert.deepEqual([...entries.get(imagePaths[0]!)!.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    const opf = decoder.decode(entries.get("OEBPS/package.opf")!);
    assert.match(opf, new RegExp(`id="image-${imagePaths[0]!.split("/").pop()!.slice(0, -4)}"[^>]*href="images/${imagePaths[0]!.split("/").pop()}" media-type="image/png"`));
    const xhtml = decoder.decode(entries.get("OEBPS/text/page-0001.xhtml")!);
    assert.equal((xhtml.match(/class="fileshape-image"/g) ?? []).length, 3);
    assert.equal((xhtml.match(new RegExp(`\.\.\/images\/${imagePaths[0]!.split("/").pop()}`, "g")) ?? []).length, 3);
    assert.equal((await readdir(directory)).filter((entry) => entry.includes("image.epub.") && entry.endsWith(".tmp")).length, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("default rotated production fixture fails closed under the Stage 19 transform contract", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fileshape-stage19-rotated-"));
  try {
    const input = path.join(directory, "rotated.pdf");
    await writeFile(input, imagePdfBytes({ includeInline: false }));
    await assert.rejects(
      () => convertPdfToEpub(input, path.join(directory, "rotated.epub"), { title: "Rotated", modified: "2026-09-12T00:00:00Z" }),
      /unsupported display transform/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
