import assert from "node:assert/strict";
import test from "node:test";
import type { FileShapeDocument, DocumentTextBlock } from "../src/document-model.js";
import { inferStructuralHeadings } from "../src/heading-inference.js";
import type { InspectPage, InspectResult, InspectTextItem } from "../src/pdf-inspection-model.js";

function item(text: string, fontName: string, fontSize = 14): InspectTextItem {
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

function block(page: number, index: number, itemIndex: number, text: string): DocumentTextBlock {
  return {
    kind: "text",
    sourcePage: page,
    semanticBlockIndex: index,
    unitIndexes: [index],
    semanticText: text,
    sourceRanges: [{ page, itemIndex, charStart: 0, charEnd: text.length }],
    inlines: [{
      kind: "text",
      text,
      sourceRanges: [{ page, itemIndex, charStart: 0, charEnd: text.length }],
    }],
  };
}

function fixture(
  pageCount: number,
  headingPages: Map<number, string>,
  numericBodyPage?: number,
): { document: FileShapeDocument; inspection: InspectResult } {
  const inspectionPages: InspectPage[] = [];
  const documentPages: FileShapeDocument["pages"] = [];
  const sourcePages: FileShapeDocument["source"]["pages"] = [];

  for (let page = 1; page <= pageCount; page += 1) {
    const heading = headingPages.get(page);
    const body = page === numericBodyPage ? "01 this is ordinary body text" : `ordinary body text ${page} `.repeat(8);
    const textItems = heading === undefined
      ? [item(body, "BodyFace")]
      : [item(heading, "HeadingFace"), item(body, "BodyFace")];
    inspectionPages.push({
      page,
      width: 600,
      height: 800,
      rotation: 0,
      userUnit: 1,
      view: [0, 0, 600, 800],
      textItemCount: textItems.length,
      imagePaintOps: 0,
      textItems,
    });
    sourcePages.push({
      page,
      textItems: textItems.map((entry, itemIndex) => ({ itemIndex, text: entry.text })),
    });
    documentPages.push({
      kind: "page",
      sourcePage: page,
      rotation: 0,
      orientation: "vertical",
      blocks: heading === undefined
        ? [block(page, 0, 0, body)]
        : [block(page, 0, 0, heading), block(page, 1, 1, body)],
      imageOccurrences: [],
      unresolvedRuby: [],
      unmappedExactRuby: [],
    });
  }

  const document: FileShapeDocument = {
    kind: "document",
    id: "fixture:heading-inference",
    source: { documentId: "fixture:heading-inference", pages: sourcePages },
    pages: documentPages,
    imageResources: [],
  };
  const inspection: InspectResult = {
    file: "fixture.pdf",
    byteLength: 1,
    pageCount,
    pages: inspectionPages,
  };
  return { document, inspection };
}

test("recurring layout style and cadence identify major headings without title syntax", () => {
  const headings = new Map<number, string>([
    [2, "prefatory note"],
    [3, "Moonlight over the station"],
    [7, "◆"],
    [8, "名前のない節"],
    [12, "tail note"],
  ]);
  const { document, inspection } = fixture(12, headings);
  assert.deepEqual(inferStructuralHeadings(document, inspection), [
    { title: "Moonlight over the station", sourcePage: 3, semanticBlockIndex: 0 },
    { title: "名前のない節", sourcePage: 8, semanticBlockIndex: 0 },
  ]);
});

test("when there is no short auxiliary cadence, every recurring structural style is retained", () => {
  const headings = new Map<number, string>([
    [1, "Beginning"],
    [4, "第二幕"],
    [7, "No number at all"],
  ]);
  const { document, inspection } = fixture(10, headings);
  assert.deepEqual(
    inferStructuralHeadings(document, inspection).map(({ title, sourcePage }) => ({ title, sourcePage })),
    [
      { title: "Beginning", sourcePage: 1 },
      { title: "第二幕", sourcePage: 4 },
      { title: "No number at all", sourcePage: 7 },
    ],
  );
});

test("digits and heading-like words in ordinary body style never create a heading", () => {
  const { document, inspection } = fixture(8, new Map(), 1);
  assert.deepEqual(inferStructuralHeadings(document, inspection), []);
});
