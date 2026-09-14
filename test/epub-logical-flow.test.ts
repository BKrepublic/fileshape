import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { DocumentImageOccurrence, DocumentPage, FileShapeDocument } from "../src/document-model.js";
import { buildDocumentNavigation, type SourceOutlineItem } from "../src/document-navigation.js";
import { serializeLegacyNcx } from "../src/epub-ncx.js";
import { serializeEpubNavigation } from "../src/epub-navigation.js";
import { serializeEpubXhtml } from "../src/epub-xhtml.js";

function documentFixture(texts: string[]): FileShapeDocument {
  const pages: DocumentPage[] = texts.map((text, index) => {
    const page = index + 1;
    return {
      kind: "page",
      sourcePage: page,
      rotation: 0,
      orientation: "vertical",
      imageOccurrences: [],
      unresolvedRuby: [],
      unmappedExactRuby: [],
      blocks: [{
        kind: "text",
        sourcePage: page,
        semanticBlockIndex: 0,
        unitIndexes: [0],
        semanticText: text,
        sourceRanges: [{ page, itemIndex: 0, charStart: 0, charEnd: text.length }],
        inlines: [{
          kind: "text",
          text,
          sourceRanges: [{ page, itemIndex: 0, charStart: 0, charEnd: text.length }],
        }],
      }],
    };
  });
  return {
    kind: "document",
    id: "logical-flow",
    imageResources: [],
    source: {
      documentId: "logical-flow",
      pages: texts.map((text, index) => ({
        page: index + 1,
        textItems: [{ itemIndex: 0, text }],
      })),
    },
    pages,
  };
}

function attachOutline(document: FileShapeDocument, outline: SourceOutlineItem[]): void {
  document.source.outline = outline;
  document.navigation = buildDocumentNavigation(outline);
}

function attachSingleOutlineBoundary(document: FileShapeDocument): void {
  attachOutline(document, [{
    title: "Source section",
    destination: null,
    target: { status: "resolved", sourcePage: 1 },
    items: [],
  }]);
}

function setEdgeGeometry(
  document: FileShapeDocument,
  pageNumber: number,
  firstUnitInlineStartRatio: number,
  lastUnitInlineEndRatio: number,
  lastUnitInlineCoverageRatio: number,
): void {
  const block = document.pages[pageNumber - 1]?.blocks[0];
  assert.ok(block);
  block.edgeGeometry = {
    firstUnitInlineStartRatio,
    lastUnitInlineEndRatio,
    lastUnitInlineCoverageRatio,
  };
}

function serializedContinuation(
  previousEndRatio: number,
  previousCoverageRatio: number,
  nextStartRatio: number,
  firstText = "終端。",
  nextText = "「次」",
): ReturnType<typeof serializeEpubXhtml> {
  const document = documentFixture([firstText, nextText]);
  setEdgeGeometry(document, 1, 0.1, previousEndRatio, previousCoverageRatio);
  setEdgeGeometry(document, 2, nextStartRatio, 0.6, 0.5);
  return serializeEpubXhtml(document);
}

const structuralHeadings = [
  { title: "序章ではない名前", sourcePage: 1, semanticBlockIndex: 0 },
  { title: "◆第二の区切り", sourcePage: 3, semanticBlockIndex: 0 },
];

const PAGE_MARKUP_ESTIMATE = 128;
const BLOCK_MARKUP_ESTIMATE = 160;
const SOFT_XHTML_BUDGET = 256 * 1024;
const HARD_XHTML_BUDGET = 1024 * 1024;

function twoPageBudgetDocument(totalEstimatedChars: number, delta = 0): FileShapeDocument {
  const firstTextLength = totalEstimatedChars / 2 - PAGE_MARKUP_ESTIMATE - BLOCK_MARKUP_ESTIMATE;
  assert.equal(Number.isInteger(firstTextLength), true);
  const secondTextLength = firstTextLength + delta;
  return documentFixture([
    "a".repeat(firstTextLength),
    "b".repeat(secondTextLength),
  ]);
}

function continuedTwoPageBudgetDocument(totalEstimatedChars: number, delta = 0): FileShapeDocument {
  const document = twoPageBudgetDocument(totalEstimatedChars, delta);
  setEdgeGeometry(document, 1, 0.1, 0.95, 0.8);
  setEdgeGeometry(document, 2, 0.1, 0.6, 0.5);
  return document;
}

function splitLogicalText(text: string, lengths: number[]): string[] {
  const pages: string[] = [];
  let offset = 0;
  for (const length of lengths) {
    pages.push(text.slice(offset, offset + length));
    offset += length;
  }
  assert.equal(offset, text.length);
  return pages;
}

function standalonePage(sourcePage: number): DocumentPage {
  return {
    kind: "page",
    sourcePage,
    rotation: 0,
    orientation: "vertical",
    imageOccurrences: [],
    unresolvedRuby: [],
    unmappedExactRuby: [],
    blocks: [],
  };
}

function blankAndImageDocument(): FileShapeDocument {
  const document = documentFixture(["本文", "末尾"]);
  const first = document.pages[0]!;
  const last = document.pages[1]!;
  last.sourcePage = 4;
  for (const block of last.blocks) {
    block.sourcePage = 4;
    for (const range of block.sourceRanges) range.page = 4;
    for (const inline of block.inlines) {
      if (inline.kind === "text") {
        for (const range of inline.sourceRanges) range.page = 4;
      } else {
        for (const range of inline.base.sourceRanges) range.page = 4;
        for (const range of inline.annotation.sourceRanges) range.page = 4;
      }
    }
  }

  const imageBytes = Uint8Array.from(Array.from({ length: 16 }, (_, index) => index));
  const contentHash = createHash("sha256").update(imageBytes).digest("hex");
  const resourceId = `image-${contentHash}`;
  const imageOccurrence: DocumentImageOccurrence = {
    kind: "image",
    sourcePage: 3,
    operatorIndex: 0,
    occurrenceIndex: 0,
    placementIndex: 0,
    resourceId,
    displayTransform: [20, 0, 0, -20, 0, 20],
    displayBounds: { left: 0, top: 0, right: 20, bottom: 20 },
    formDepth: 0,
    interpolate: false,
    clipStatus: "none",
    clipCoverage: "none",
  };
  const imagePage = standalonePage(3);
  imagePage.imageOccurrences = [imageOccurrence];

  document.source.pages = [
    { page: 1, textItems: [{ itemIndex: 0, text: "本文" }] },
    { page: 2, textItems: [] },
    { page: 3, textItems: [] },
    { page: 4, textItems: [{ itemIndex: 0, text: "末尾" }] },
  ];
  document.pages = [first, standalonePage(2), imagePage, last];
  document.imageResources = [{
    id: resourceId,
    contentHash,
    mediaType: "image/png",
    extension: "png",
    width: 2,
    height: 2,
    pixelKind: "rgba32",
    decodedByteLength: 16,
    bytes: imageBytes,
  }];
  return document;
}

test("structural headings join following PDF pages into one reflowable XHTML resource", () => {
  const document = documentFixture([
    "序章ではない名前",
    "前ページから続く本文。",
    "◆第二の区切り",
    "次章の本文。",
  ]);

  const result = serializeEpubXhtml(document, { structuralHeadings });
  assert.equal(result.pages.length, 2);
  assert.deepEqual(result.pages[0]?.sourcePages, [1, 2]);
  assert.deepEqual(result.pages[1]?.sourcePages, [3, 4]);
  assert.equal(result.pages[0]?.href, "text/page-0001.xhtml");
  assert.equal(result.pages[1]?.href, "text/page-0003.xhtml");

  const first = result.pages[0]?.xhtml ?? "";
  assert.match(first, /<h1 id="heading-page-1-block-0" class="fileshape-heading"[^>]*>序章ではない名前<\/h1>/);
  assert.match(first, /id="source-page-1"/);
  assert.match(first, /id="source-page-2"/);
  assert.match(first, /前ページから続く本文。/);
  assert.doesNotMatch(first, /source-page-3/);
});

test("structural headings become EPUB TOC entries while PDF pages remain page-list targets", () => {
  const document = documentFixture([
    "序章ではない名前",
    "本文。",
    "◆第二の区切り",
    "本文その二。",
  ]);
  const xhtml = serializeEpubXhtml(document, { structuralHeadings });
  const navigation = serializeEpubNavigation(document, "Book", "ja", xhtml.pages);

  assert.equal(navigation.summary.mode, "outline");
  assert.equal(navigation.summary.outlineEntries, 2);
  assert.match(navigation.xhtml, /page-0001\.xhtml#heading-page-1-block-0">序章ではない名前<\/a>/);
  assert.match(navigation.xhtml, /page-0003\.xhtml#heading-page-3-block-0">◆第二の区切り<\/a>/);
  assert.match(navigation.xhtml, /page-0001\.xhtml#source-page-2">Page 2<\/a>/);
  assert.match(navigation.xhtml, /page-0003\.xhtml#source-page-4">Page 4<\/a>/);
});

test("resolved source outline destinations target anchors without changing XHTML grouping", () => {
  const document = documentFixture([
    "front matter",
    "section A",
    "body A",
    "section B",
    "body B",
  ]);
  attachOutline(document, [{
    title: "Source section A",
    destination: null,
    target: { status: "resolved", sourcePage: 2 },
    items: [{
      title: "Source section B",
      destination: null,
      target: { status: "resolved", sourcePage: 4 },
      items: [],
    }],
  }]);

  const xhtml = serializeEpubXhtml(document);
  assert.equal(xhtml.pages.length, 1);
  assert.deepEqual(xhtml.pages[0]?.sourcePages, [1, 2, 3, 4, 5]);
  assert.equal(xhtml.pages[0]?.heading, undefined);

  const navigation = serializeEpubNavigation(document, "Book", "en", xhtml.pages);
  assert.equal(navigation.summary.mode, "outline");
  assert.equal(navigation.summary.outlineEntries, 2);
  assert.match(navigation.xhtml, /page-0001\.xhtml#source-page-2">Source section A<\/a>/);
  assert.match(navigation.xhtml, /page-0001\.xhtml#source-page-4">Source section B<\/a>/);
});

test("outline-backed XHTML keeps mixed writing orientations in scoped runs", () => {
  const document = documentFixture([
    "section",
    "vertical body",
    "horizontal insert",
    "horizontal continuation",
  ]);
  attachOutline(document, [{
    title: "Section",
    destination: null,
    target: { status: "resolved", sourcePage: 1 },
    items: [],
  }]);
  document.pages[2]!.orientation = "horizontal";
  document.pages[3]!.orientation = "horizontal";

  const xhtml = serializeEpubXhtml(document);
  assert.deepEqual(xhtml.pages.map((page) => page.sourcePages), [[1, 2, 3, 4]]);
  const body = xhtml.pages[0]?.xhtml ?? "";
  assert.match(body, /class="fileshape-page fileshape-mixed-orientation"/);
  assert.match(body, /class="fileshape-orientation-run fileshape-vertical" style="writing-mode: vertical-rl;"/);
  assert.match(body, /class="fileshape-orientation-run fileshape-horizontal" style="writing-mode: horizontal-tb;"/);
  assert.ok(body.indexOf("vertical body") < body.indexOf("horizontal insert"));
});

test("documents without structural boundaries do not serialize one XHTML per PDF page", () => {
  const document = documentFixture(["one", "two", "three", "four"]);
  const xhtml = serializeEpubXhtml(document);

  assert.equal(xhtml.pages.length, 1);
  assert.deepEqual(xhtml.pages[0]?.sourcePages, [1, 2, 3, 4]);
});

test("fallback serialization chunks by estimated XHTML size rather than physical page count", () => {
  const document = documentFixture(Array.from({ length: 6 }, (_, index) =>
    String(index).repeat(60_000)));
  const xhtml = serializeEpubXhtml(document);

  assert.equal(xhtml.pages.length, 2);
  assert.deepEqual(xhtml.pages[0]?.sourcePages, [1, 2, 3, 4]);
  assert.deepEqual(xhtml.pages[1]?.sourcePages, [5, 6]);
});

test("soft XHTML budget is strict above the exact estimated boundary", () => {
  const justBelow = serializeEpubXhtml(twoPageBudgetDocument(SOFT_XHTML_BUDGET, -1));
  const atBoundary = serializeEpubXhtml(twoPageBudgetDocument(SOFT_XHTML_BUDGET));
  const justAbove = serializeEpubXhtml(twoPageBudgetDocument(SOFT_XHTML_BUDGET, 1));

  assert.deepEqual(justBelow.pages.map((page) => page.sourcePages), [[1, 2]]);
  assert.deepEqual(atBoundary.pages.map((page) => page.sourcePages), [[1, 2]]);
  assert.deepEqual(justAbove.pages.map((page) => page.sourcePages), [[1], [2]]);
});

test("soft XHTML size budget does not split a source-backed continuing paragraph", () => {
  const document = documentFixture(["a".repeat(150_000), "b".repeat(150_000)]);
  setEdgeGeometry(document, 1, 0.1, 0.95, 0.8);
  setEdgeGeometry(document, 2, 0.1, 0.6, 0.5);

  const xhtml = serializeEpubXhtml(document);
  assert.equal(xhtml.pages.length, 1);
  assert.deepEqual(xhtml.pages[0]?.sourcePages, [1, 2]);
  assert.match(xhtml.pages[0]?.xhtml ?? "", /class="fileshape-block-continuation"/);
});

test("hard XHTML budget permits continuation at equality but splits strictly above it", () => {
  const atBoundary = serializeEpubXhtml(continuedTwoPageBudgetDocument(HARD_XHTML_BUDGET));
  const justAbove = serializeEpubXhtml(continuedTwoPageBudgetDocument(HARD_XHTML_BUDGET, 1));

  assert.deepEqual(atBoundary.pages.map((page) => page.sourcePages), [[1, 2]]);
  assert.match(atBoundary.pages[0]?.xhtml ?? "", /class="fileshape-block-continuation"/);
  assert.deepEqual(justAbove.pages.map((page) => page.sourcePages), [[1], [2]]);
});

test("equivalent logical text redistributed across source pages keeps one resource under budget", () => {
  const logicalText = "A".repeat(10_000) + "B".repeat(10_000);
  const evenlySplit = serializeEpubXhtml(
    documentFixture(splitLogicalText(logicalText, [5_000, 5_000, 5_000, 5_000])),
  );
  const unevenlySplit = serializeEpubXhtml(
    documentFixture(splitLogicalText(logicalText, [2_000, 8_000, 2_000, 8_000])),
  );

  assert.deepEqual(evenlySplit.pages.map((page) => page.sourcePages), [[1, 2, 3, 4]]);
  assert.deepEqual(unevenlySplit.pages.map((page) => page.sourcePages), [[1, 2, 3, 4]]);
});

test("blank and image-only source pages remain standalone logical resources", () => {
  const document = blankAndImageDocument();
  const result = serializeEpubXhtml(document);

  assert.deepEqual(result.pages.map((page) => page.sourcePages), [[1], [2], [3], [4]]);
  assert.match(result.pages[1]?.xhtml ?? "", /fileshape-page-blank/);
  assert.match(result.pages[2]?.xhtml ?? "", /fileshape-page-has-images/);
  for (const [index, sourcePage] of [1, 2, 3, 4].entries()) {
    assert.match(result.pages[index]?.xhtml ?? "", new RegExp(`id="source-page-${sourcePage}"`));
  }

  const navigation = serializeEpubNavigation(document, "Book", "ja", result.pages);
  const ncx = serializeLegacyNcx(document, "Book", document.id, result.pages);
  for (const sourcePage of [1, 2, 3, 4]) {
    const target = `page-000${sourcePage}\\.xhtml#source-page-${sourcePage}`;
    assert.match(navigation.xhtml, new RegExp(target));
    assert.match(ncx, new RegExp(target));
  }
});

test("cross-page paragraph continuation follows edge geometry even when text looks sentence-final", () => {
  const document = documentFixture(["終端。", "「次」"]);
  attachSingleOutlineBoundary(document);
  setEdgeGeometry(document, 1, 0.1, 0.95, 0.8);
  setEdgeGeometry(document, 2, 0.1, 0.6, 0.5);

  const body = serializeEpubXhtml(document).pages[0]?.xhtml ?? "";
  assert.match(body, /class="fileshape-block-continuation"/);
  assert.equal((body.match(/<p class="fileshape-block"/g) ?? []).length, 1);
});

test("logical XHTML continuation agrees with shared edge boundaries", () => {
  const firstText = "終端。" + "a".repeat(149_997);
  const nextText = "「次」" + "b".repeat(149_997);
  const cases = [
    { previousEnd: 0.78, coverage: 0.5, nextStart: 0.32, expected: true },
    { previousEnd: 0.78 - 1e-6, coverage: 0.5, nextStart: 0.32, expected: false },
    { previousEnd: 0.78, coverage: 0.5 - 1e-6, nextStart: 0.32, expected: false },
    { previousEnd: 0.78, coverage: 0.5, nextStart: 0.32 + 1e-6, expected: false },
  ];

  for (const { previousEnd, coverage, nextStart, expected } of cases) {
    const result = serializedContinuation(previousEnd, coverage, nextStart, firstText, nextText);
    const body = result.pages.map((page) => page.xhtml).join("");
    assert.equal(result.pages.length, expected ? 1 : 2);
    assert.deepEqual(
      result.pages.map((page) => page.sourcePages),
      expected ? [[1, 2]] : [[1], [2]],
    );
    assert.equal(body.includes("fileshape-block-continuation"), expected);
    assert.equal((body.match(/<p class="fileshape-block"/g) ?? []).length, expected ? 1 : 2);
  }
});

test("logical XHTML continuation depends on geometry rather than punctuation or text", () => {
  const exactPunctuation = serializedContinuation(
    0.78,
    0.5,
    0.32,
    "終端。" + "a".repeat(149_997),
    "「次」" + "b".repeat(149_997),
  );
  const exactPlain = serializedContinuation(
    0.78,
    0.5,
    0.32,
    "plain alpha!" + "a".repeat(149_988),
    "plain beta?" + "b".repeat(149_989),
  );
  const punctuationBody = exactPunctuation.pages.map((page) => page.xhtml).join("");
  const plainBody = exactPlain.pages.map((page) => page.xhtml).join("");

  assert.deepEqual(exactPunctuation.pages.map((page) => page.sourcePages), [[1, 2]]);
  assert.deepEqual(exactPlain.pages.map((page) => page.sourcePages), [[1, 2]]);
  assert.equal(punctuationBody.includes("fileshape-block-continuation"), true);
  assert.equal(plainBody.includes("fileshape-block-continuation"), true);
  assert.equal((punctuationBody.match(/<p class="fileshape-block"/g) ?? []).length, 1);
  assert.equal((plainBody.match(/<p class="fileshape-block"/g) ?? []).length, 1);
});

test("cross-page paragraph stays separate when edge geometry disagrees even without punctuation", () => {
  const document = documentFixture(["unfinished", "continuation"]);
  attachSingleOutlineBoundary(document);
  setEdgeGeometry(document, 1, 0.1, 0.65, 0.55);
  setEdgeGeometry(document, 2, 0.1, 0.7, 0.5);

  const body = serializeEpubXhtml(document).pages[0]?.xhtml ?? "";
  assert.doesNotMatch(body, /class="fileshape-block-continuation"/);
  assert.equal((body.match(/<p class="fileshape-block"/g) ?? []).length, 2);
});
