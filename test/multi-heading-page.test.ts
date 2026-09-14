import assert from "node:assert/strict";
import test from "node:test";
import type {
  DocumentPage,
  DocumentTextBlock,
  FileShapeDocument,
} from "../src/document-model.js";
import { serializeEpubNavigation } from "../src/epub-navigation.js";
import { serializeLegacyNcx } from "../src/epub-ncx.js";
import { serializeEpubXhtml } from "../src/epub-xhtml.js";
import { inferStructuralHeadings } from "../src/heading-inference.js";
import type {
  InspectPage,
  InspectResult,
  InspectTextItem,
} from "../src/pdf-inspection-model.js";

function item(text: string, fontName: string, fontSize: number): InspectTextItem {
  return {
    text,
    dir: "ttb",
    fontName,
    width: fontSize,
    height: fontSize,
    transform: [1, 0, 0, 1, 0, 0],
    x: 0,
    y: 0,
    displayTransform: [1, 0, 0, 1, 0, 0],
    displayX: 0,
    displayY: 0,
    fontSize,
    hasEOL: false,
  };
}

function block(
  page: number,
  semanticBlockIndex: number,
  itemIndex: number,
  text: string,
): DocumentTextBlock {
  const range = { page, itemIndex, charStart: 0, charEnd: text.length };
  return {
    kind: "text",
    sourcePage: page,
    semanticBlockIndex,
    unitIndexes: [semanticBlockIndex],
    semanticText: text,
    sourceRanges: [range],
    inlines: [{ kind: "text", text, sourceRanges: [range] }],
  };
}

function fixture(): { document: FileShapeDocument; inspection: InspectResult } {
  const firstItems = [
    item("First heading", "HeadingFace", 20),
    item("ordinary body text ".repeat(20), "BodyFace", 14),
    item("Second heading", "HeadingFace", 20),
  ];
  const secondItems = [
    item("Third heading", "HeadingFace", 20),
    item("more ordinary body text ".repeat(20), "BodyFace", 14),
  ];

  const pages: DocumentPage[] = [
    {
      kind: "page",
      sourcePage: 1,
      rotation: 0,
      orientation: "vertical",
      imageOccurrences: [],
      unresolvedRuby: [],
      unmappedExactRuby: [],
      blocks: [
        block(1, 0, 0, firstItems[0]!.text),
        block(1, 1, 1, firstItems[1]!.text),
        block(1, 2, 2, firstItems[2]!.text),
      ],
    },
    {
      kind: "page",
      sourcePage: 2,
      rotation: 0,
      orientation: "vertical",
      imageOccurrences: [],
      unresolvedRuby: [],
      unmappedExactRuby: [],
      blocks: [
        block(2, 0, 0, secondItems[0]!.text),
        block(2, 1, 1, secondItems[1]!.text),
      ],
    },
  ];

  const inspectionPages: InspectPage[] = [
    {
      page: 1,
      width: 600,
      height: 800,
      rotation: 0,
      userUnit: 1,
      view: [0, 0, 600, 800],
      textItemCount: firstItems.length,
      imagePaintOps: 0,
      textItems: firstItems,
    },
    {
      page: 2,
      width: 600,
      height: 800,
      rotation: 0,
      userUnit: 1,
      view: [0, 0, 600, 800],
      textItemCount: secondItems.length,
      imagePaintOps: 0,
      textItems: secondItems,
    },
  ];

  return {
    document: {
      kind: "document",
      id: "fixture:multi-heading",
      source: {
        documentId: "fixture:multi-heading",
        pages: inspectionPages.map((page) => ({
          page: page.page,
          textItems: page.textItems.map((entry, itemIndex) => ({ itemIndex, text: entry.text })),
        })),
      },
      pages,
      imageResources: [],
    },
    inspection: {
      file: "fixture.pdf",
      byteLength: 1,
      pageCount: inspectionPages.length,
      pages: inspectionPages,
    },
  };
}

test("multiple recurring heading blocks on one source page survive through XHTML, NAV and NCX", () => {
  const { document, inspection } = fixture();
  const headings = inferStructuralHeadings(document, inspection);

  assert.deepEqual(headings, [
    { title: "First heading", sourcePage: 1, semanticBlockIndex: 0 },
    { title: "Second heading", sourcePage: 1, semanticBlockIndex: 2 },
    { title: "Third heading", sourcePage: 2, semanticBlockIndex: 0 },
  ]);

  const xhtml = serializeEpubXhtml(document, { structuralHeadings: headings });
  assert.equal(xhtml.pages.length, 2);
  assert.equal(xhtml.pages[0]?.headings.length, 2);
  assert.equal(xhtml.pages[1]?.headings.length, 1);

  const first = xhtml.pages[0]?.xhtml ?? "";
  assert.match(first, /<h1 id="heading-page-1-block-0"[^>]*>First heading<\/h1>/);
  assert.match(first, /<h1 id="heading-page-1-block-2"[^>]*>Second heading<\/h1>/);

  const navigation = serializeEpubNavigation(document, "Book", "en", xhtml.pages);
  assert.equal(navigation.summary.outlineEntries, 3);
  assert.match(navigation.xhtml, /page-0001\.xhtml#heading-page-1-block-0">First heading<\/a>/);
  assert.match(navigation.xhtml, /page-0001\.xhtml#heading-page-1-block-2">Second heading<\/a>/);
  assert.match(navigation.xhtml, /page-0002\.xhtml#heading-page-2-block-0">Third heading<\/a>/);

  const ncx = serializeLegacyNcx(document, "Book", "urn:test", xhtml.pages);
  assert.match(ncx, /page-0001\.xhtml#heading-page-1-block-0/);
  assert.match(ncx, /page-0001\.xhtml#heading-page-1-block-2/);
  assert.match(ncx, /page-0002\.xhtml#heading-page-2-block-0/);
});
