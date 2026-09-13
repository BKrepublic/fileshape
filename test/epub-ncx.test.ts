import assert from "node:assert/strict";
import test from "node:test";
import type { DocumentTextBlock, FileShapeDocument } from "../src/document-model.js";
import { serializeLegacyNcx } from "../src/epub-ncx.js";
import { serializeEpubXhtml } from "../src/epub-xhtml.js";

function block(page: number, index: number, text: string): DocumentTextBlock {
  return {
    kind: "text",
    sourcePage: page,
    semanticBlockIndex: index,
    unitIndexes: [index],
    semanticText: text,
    sourceRanges: [{ page, itemIndex: index, charStart: 0, charEnd: text.length }],
    inlines: [{ kind: "text", text, sourceRanges: [{ page, itemIndex: index, charStart: 0, charEnd: text.length }] }],
  };
}

function fixture(): FileShapeDocument {
  const h1 = "01　第一話";
  const body1 = "　本文。";
  const h2 = "02　第二話";
  const body2 = "　続き。";
  return {
    kind: "document",
    id: "urn:test:ncx",
    imageResources: [],
    source: {
      documentId: "urn:test:ncx",
      pages: [
        { page: 1, textItems: [{ itemIndex: 0, text: h1 }, { itemIndex: 1, text: body1 }] },
        { page: 2, textItems: [{ itemIndex: 0, text: h2 }, { itemIndex: 1, text: body2 }] },
      ],
    },
    pages: [
      { kind: "page", sourcePage: 1, rotation: 0, orientation: "vertical", imageOccurrences: [], unresolvedRuby: [], unmappedExactRuby: [], blocks: [block(1, 0, h1), block(1, 1, body1)] },
      { kind: "page", sourcePage: 2, rotation: 0, orientation: "vertical", imageOccurrences: [], unresolvedRuby: [], unmappedExactRuby: [], blocks: [block(2, 0, h2), block(2, 1, body2)] },
    ],
  };
}

test("legacy NCX mirrors inferred EPUB3 chapter headings for older reading systems", () => {
  const document = fixture();
  const pages = serializeEpubXhtml(document).pages;
  const ncx = serializeLegacyNcx(document, "Book", "urn:test:ncx", pages);
  assert.match(ncx, /<text>01第一話<\/text>/);
  assert.match(ncx, /<content src="text\/page-0001\.xhtml#heading-page-1"\/>/);
  assert.match(ncx, /<text>02第二話<\/text>/);
  assert.match(ncx, /<content src="text\/page-0002\.xhtml#heading-page-2"\/>/);
});
