import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  parseCoverOccurrenceSelector,
  resolveCoverImageResourceId,
} from "../src/cover-policy.js";
import type { DocumentImageOccurrence, FileShapeDocument } from "../src/document-model.js";
import { validateEpubImagePackage } from "../src/epub-image-package-validation.js";
import { serializeEpubPackage } from "../src/epub-package.js";

const decoder = new TextDecoder();
const imageBytes = Uint8Array.from([1, 2, 3, 4]);
const imageHash = createHash("sha256").update(imageBytes).digest("hex");
const resourceId = `image-${imageHash}`;

function occurrence(operatorIndex: number, left: number): DocumentImageOccurrence {
  return {
    kind: "image",
    sourcePage: 1,
    operatorIndex,
    occurrenceIndex: 0,
    placementIndex: 0,
    resourceId,
    displayTransform: [10, 0, 0, -10, left, 10],
    displayBounds: { left, top: 0, right: left + 10, bottom: 10 },
    formDepth: 0,
    interpolate: false,
    clipStatus: "none",
    clipCoverage: "none",
  };
}

function documentFixture(): FileShapeDocument {
  return {
    kind: "document",
    id: "urn:fileshape:cover-fixture",
    imageResources: [{
      id: resourceId,
      contentHash: imageHash,
      mediaType: "image/png",
      extension: "png",
      width: 1,
      height: 1,
      pixelKind: "rgba32",
      decodedByteLength: 4,
      bytes: imageBytes,
    }],
    source: {
      documentId: "urn:fileshape:cover-fixture",
      pages: [{ page: 1, textItems: [] }],
    },
    pages: [{
      kind: "page",
      sourcePage: 1,
      rotation: 0,
      orientation: "unknown",
      blocks: [],
      imageOccurrences: [occurrence(10, 0), occurrence(20, 20)],
      unresolvedRuby: [],
      unmappedExactRuby: [],
    }],
  };
}

function packageText(document: FileShapeDocument, coverImageResourceId?: string): { opf: string; xhtml: string; pngCount: number } {
  const epub = serializeEpubPackage(document, {
    title: "Cover fixture",
    modified: "2026-09-12T00:00:00Z",
    ...(coverImageResourceId === undefined ? {} : { coverImageResourceId }),
  });
  return {
    opf: decoder.decode(epub.files.find((file) => file.path === "OEBPS/package.opf")!.data),
    xhtml: decoder.decode(epub.files.find((file) => file.path === "OEBPS/text/page-0001.xhtml")!.data),
    pngCount: epub.files.filter((file) => file.mediaType === "image/png").length,
  };
}

test("cover occurrence parser accepts only exact non-negative provenance", () => {
  assert.deepEqual(parseCoverOccurrenceSelector("1:0:2"), {
    sourcePage: 1,
    operatorIndex: 0,
    occurrenceIndex: 2,
  });
  for (const value of ["", "1", "1:2", "1:2:3:4", "0:2:3", "-1:2:3", "1:-2:3", "1:2:-3", "1.5:2:3", "x:2:3", "9007199254740992:0:0"]) {
    assert.throws(() => parseCoverOccurrenceSelector(value));
  }
});

test("exact cover occurrence resolves to the existing image resource", () => {
  const document = documentFixture();
  assert.equal(resolveCoverImageResourceId(document, {
    sourcePage: 1,
    operatorIndex: 20,
    occurrenceIndex: 0,
  }), resourceId);
  assert.throws(() => resolveCoverImageResourceId(document, {
    sourcePage: 1,
    operatorIndex: 99,
    occurrenceIndex: 0,
  }), /cover occurrence not found/);
});

test("duplicate provenance is ambiguous instead of picking the first occurrence", () => {
  const document = documentFixture();
  document.pages[0]!.imageOccurrences.push({ ...document.pages[0]!.imageOccurrences[0]! });
  assert.throws(() => resolveCoverImageResourceId(document, {
    sourcePage: 1,
    operatorIndex: 10,
    occurrenceIndex: 0,
  }), /cover occurrence is ambiguous/);
});

test("default EPUB has no inferred cover-image property", () => {
  const packaged = packageText(documentFixture());
  assert.doesNotMatch(packaged.opf, /properties="cover-image"/);
  assert.equal(packaged.pngCount, 1);
  assert.equal((packaged.xhtml.match(/class="fileshape-image"/g) ?? []).length, 2);
});

test("explicit cover marks one shared resource without removing body occurrences", () => {
  const document = documentFixture();
  const selected = resolveCoverImageResourceId(document, {
    sourcePage: 1,
    operatorIndex: 20,
    occurrenceIndex: 0,
  });
  const packaged = packageText(document, selected);
  assert.match(packaged.opf, new RegExp(`id="${resourceId}"[^>]*properties="cover-image"`));
  assert.equal((packaged.opf.match(/properties="cover-image"/g) ?? []).length, 1);
  assert.equal(packaged.pngCount, 1);
  assert.equal((packaged.xhtml.match(/class="fileshape-image"/g) ?? []).length, 2);
  assert.match(packaged.xhtml, /data-operator-index="10"/);
  assert.match(packaged.xhtml, /data-operator-index="20"/);
  assert.doesNotMatch(packaged.xhtml, /cover-image/);
});

test("package layer rejects a cover resource not present in the document", () => {
  assert.throws(() => serializeEpubPackage(documentFixture(), {
    title: "Cover fixture",
    modified: "2026-09-12T00:00:00Z",
    coverImageResourceId: "image-does-not-exist",
  }), /cover image resource does not exist in document/);
});

test("archive image validation reports default and explicit cover designation", () => {
  const document = documentFixture();
  const defaultEpub = serializeEpubPackage(document, {
    title: "Cover fixture",
    modified: "2026-09-12T00:00:00Z",
  });
  const explicitEpub = serializeEpubPackage(document, {
    title: "Cover fixture",
    modified: "2026-09-12T00:00:00Z",
    coverImageResourceId: resourceId,
  });
  const defaultValidation = validateEpubImagePackage(defaultEpub.bytes);
  const explicitValidation = validateEpubImagePackage(explicitEpub.bytes);
  assert.deepEqual(defaultValidation.issues, []);
  assert.deepEqual(defaultValidation.coverImageHashes, []);
  assert.deepEqual(explicitValidation.issues, []);
  assert.deepEqual(explicitValidation.coverImageHashes, [imageHash]);
  assert.equal(defaultValidation.occurrenceCount, explicitValidation.occurrenceCount);
  assert.equal(defaultValidation.resourceCount, explicitValidation.resourceCount);
});
