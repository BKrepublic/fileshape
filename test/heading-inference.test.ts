import assert from "node:assert/strict";
import test from "node:test";
import type { FileShapeDocument, DocumentTextBlock } from "../src/document-model.js";
import {
  inferStructuralHeadingEvidence,
  inferStructuralHeadings,
} from "../src/heading-inference.js";
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
  nonLeadingHeadingPages: ReadonlySet<number> = new Set(),
): { document: FileShapeDocument; inspection: InspectResult } {
  const inspectionPages: InspectPage[] = [];
  const documentPages: FileShapeDocument["pages"] = [];
  const sourcePages: FileShapeDocument["source"]["pages"] = [];

  for (let page = 1; page <= pageCount; page += 1) {
    const heading = headingPages.get(page);
    const body = page === numericBodyPage ? "01 this is ordinary body text" : `ordinary body text ${page} `.repeat(8);
    const nonLeading = heading !== undefined && nonLeadingHeadingPages.has(page);
    const textItems = heading === undefined
      ? [item(body, "BodyFace")]
      : nonLeading
        ? [item(body, "BodyFace"), item(heading, "HeadingFace")]
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
        : nonLeading
          ? [block(page, 0, 0, body), block(page, 1, 1, heading)]
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

function replaceLeadingStyle(inspection: InspectResult, pages: number[], fontName: string): void {
  for (const pageNumber of pages) {
    const page = inspection.pages[pageNumber - 1];
    const first = page?.textItems[0];
    if (!first) throw new Error(`fixture page ${pageNumber} has no leading text item`);
    first.fontName = fontName;
  }
}

test("recurring source-backed style retains every structural candidate without page cadence guesses", () => {
  const headings = new Map<number, string>([
    [2, "prefatory note"],
    [3, "Moonlight over the station"],
    [7, "◆"],
    [8, "名前のない節"],
    [12, "tail note"],
  ]);
  const { document, inspection } = fixture(12, headings);
  assert.deepEqual(
    inferStructuralHeadings(document, inspection).map(({ title, sourcePage }) => ({ title, sourcePage })),
    [...headings].map(([sourcePage, title]) => ({ title, sourcePage })),
  );
});

test("recurring structural style is retained regardless of physical-page leading position", () => {
  const headings = new Map<number, string>([
    [3, "First logical heading"],
    [8, "Second logical heading"],
  ]);
  const { document, inspection } = fixture(12, headings, undefined, new Set([8]));
  assert.deepEqual(inferStructuralHeadings(document, inspection), [
    { title: "First logical heading", sourcePage: 3, semanticBlockIndex: 0 },
    { title: "Second logical heading", sourcePage: 8, semanticBlockIndex: 1 },
  ]);
});

test("two independent occurrences remain recurring even in a long physical document", () => {
  const headings = new Map<number, string>([
    [5, "First section"],
    [26, "Second section"],
  ]);
  const { document, inspection } = fixture(40, headings);
  assert.deepEqual(
    inferStructuralHeadings(document, inspection).map(({ title, sourcePage }) => ({ title, sourcePage })),
    [
      { title: "First section", sourcePage: 5 },
      { title: "Second section", sourcePage: 26 },
    ],
  );
});

test("when there is one recurring structural style, every source-backed occurrence is retained", () => {
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

  const evidence = inferStructuralHeadingEvidence(document, inspection);
  assert.equal(evidence.decision, "single-recurring-family");
  assert.equal(evidence.strongestPageSupport, 3);
  assert.equal(evidence.runnerUpPageSupport, 0);
  assert.equal(evidence.supportMargin, 3);
  assert.equal(evidence.dominanceRatio, undefined);
  assert.deepEqual(evidence.families.map(({ pageSupport, selected }) => ({ pageSupport, selected })), [
    { pageSupport: 3, selected: true },
  ]);
});

test("a minor recurring non-body style cannot create false headings beside a dominant family", () => {
  const headingPages = new Map<number, string>([
    [1, "alpha"], [5, "beta"], [9, "gamma"], [13, "delta"], [17, "epsilon"],
    [21, "zeta"], [25, "eta"], [29, "theta"], [33, "iota"], [37, "kappa"],
  ]);
  const { document, inspection } = fixture(40, headingPages);
  replaceLeadingStyle(inspection, [3, 7, 11], "DecorativeFace");

  assert.deepEqual(
    inferStructuralHeadings(document, inspection).map(({ title, sourcePage }) => ({ title, sourcePage })),
    [...headingPages].map(([sourcePage, title]) => ({ title, sourcePage })),
  );

  const evidence = inferStructuralHeadingEvidence(document, inspection);
  assert.equal(evidence.decision, "clear-dominance");
  assert.equal(evidence.strongestPageSupport, 10);
  assert.equal(evidence.runnerUpPageSupport, 3);
  assert.equal(evidence.supportMargin, 7);
  assert.equal(evidence.dominanceRatio, 10 / 3);
  assert.deepEqual(evidence.families.map(({ pageSupport, selected }) => ({ pageSupport, selected })), [
    { pageSupport: 10, selected: true },
    { pageSupport: 3, selected: false },
  ]);
});

test("competing recurring non-body styles fail closed instead of guessing a heading family", () => {
  const headingPages = new Map<number, string>([
    [1, "one"], [5, "two"], [9, "three"], [13, "four"], [17, "five"],
  ]);
  const { document, inspection } = fixture(24, headingPages);
  replaceLeadingStyle(inspection, [3, 7, 11, 15], "CompetingFace");
  assert.deepEqual(inferStructuralHeadings(document, inspection), []);

  const evidence = inferStructuralHeadingEvidence(document, inspection);
  assert.equal(evidence.decision, "competing-families");
  assert.equal(evidence.strongestPageSupport, 5);
  assert.equal(evidence.runnerUpPageSupport, 4);
  assert.equal(evidence.supportMargin, 1);
  assert.equal(evidence.dominanceRatio, 1.25);
  assert.deepEqual(evidence.families.map(({ pageSupport, selected }) => ({ pageSupport, selected })), [
    { pageSupport: 5, selected: false },
    { pageSupport: 4, selected: false },
  ]);
});

test("digits and heading-like words in ordinary body style never create a heading", () => {
  const { document, inspection } = fixture(8, new Map(), 1);
  assert.deepEqual(inferStructuralHeadings(document, inspection), []);
  const evidence = inferStructuralHeadingEvidence(document, inspection);
  assert.equal(evidence.decision, "no-recurring-family");
  assert.deepEqual(evidence.families, []);
});
