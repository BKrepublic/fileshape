import assert from "node:assert/strict";
import test from "node:test";
import type { DocumentTextBlock, FileShapeDocument } from "../src/document-model.js";
import { buildDocumentNavigation } from "../src/document-navigation.js";
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
  const h1 = "Opening";
  const body1 = "　本文。";
  const h2 = "第二幕";
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

test("legacy NCX mirrors source-backed structural headings for older reading systems", () => {
  const document = fixture();
  const pages = serializeEpubXhtml(document, {
    structuralHeadings: [
      { title: "Opening", sourcePage: 1, semanticBlockIndex: 0 },
      { title: "第二幕", sourcePage: 2, semanticBlockIndex: 0 },
    ],
  }).pages;
  const ncx = serializeLegacyNcx(document, "Book", "urn:test:ncx", pages);
  assert.match(ncx, /<text>Opening<\/text>/);
  assert.match(ncx, /<content src="text\/page-0001\.xhtml#heading-page-1-block-0"\/>/);
  assert.match(ncx, /<text>第二幕<\/text>/);
  assert.match(ncx, /<content src="text\/page-0002\.xhtml#heading-page-2-block-0"\/>/);
});

test("NCX reuses playOrder when multiple outline labels resolve to the same target", () => {
  const document = fixture();
  const outline = [
    {
      title: "Parent label",
      destination: null,
      target: { status: "resolved" as const, sourcePage: 1 },
      items: [
        {
          title: "Child label",
          destination: null,
          target: { status: "resolved" as const, sourcePage: 1 },
          items: [],
        },
      ],
    },
    {
      title: "Next label",
      destination: null,
      target: { status: "resolved" as const, sourcePage: 2 },
      items: [],
    },
  ];
  document.source.outline = outline;
  document.navigation = buildDocumentNavigation(outline);

  const pages = serializeEpubXhtml(document).pages;
  const ncx = serializeLegacyNcx(document, "Book", "urn:test:ncx", pages);

  assert.match(ncx, /navPoint-1" playOrder="1"[\s\S]*?<text>Parent label<\/text>[\s\S]*?page-0001\.xhtml#source-page-1/);
  assert.match(ncx, /navPoint-2" playOrder="1"[\s\S]*?<text>Child label<\/text>[\s\S]*?page-0001\.xhtml#source-page-1/);
  assert.match(ncx, /navPoint-3" playOrder="2"[\s\S]*?<text>Next label<\/text>[\s\S]*?page-0002\.xhtml#source-page-2/);
});
