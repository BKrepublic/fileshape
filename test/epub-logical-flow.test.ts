import assert from "node:assert/strict";
import test from "node:test";
import type { DocumentPage, FileShapeDocument } from "../src/document-model.js";
import { buildDocumentNavigation, type SourceOutlineItem } from "../src/document-navigation.js";
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

const structuralHeadings = [
  { title: "序章ではない名前", sourcePage: 1, semanticBlockIndex: 0 },
  { title: "◆第二の区切り", sourcePage: 3, semanticBlockIndex: 0 },
];

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

test("soft XHTML size budget does not split a source-backed continuing paragraph", () => {
  const document = documentFixture(["a".repeat(150_000), "b".repeat(150_000)]);
  setEdgeGeometry(document, 1, 0.1, 0.95, 0.8);
  setEdgeGeometry(document, 2, 0.1, 0.6, 0.5);

  const xhtml = serializeEpubXhtml(document);
  assert.equal(xhtml.pages.length, 1);
  assert.deepEqual(xhtml.pages[0]?.sourcePages, [1, 2]);
  assert.match(xhtml.pages[0]?.xhtml ?? "", /class="fileshape-block-continuation"/);
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

test("cross-page paragraph stays separate when edge geometry disagrees even without punctuation", () => {
  const document = documentFixture(["unfinished", "continuation"]);
  attachSingleOutlineBoundary(document);
  setEdgeGeometry(document, 1, 0.1, 0.65, 0.55);
  setEdgeGeometry(document, 2, 0.1, 0.7, 0.5);

  const body = serializeEpubXhtml(document).pages[0]?.xhtml ?? "";
  assert.doesNotMatch(body, /class="fileshape-block-continuation"/);
  assert.equal((body.match(/<p class="fileshape-block"/g) ?? []).length, 2);
});
