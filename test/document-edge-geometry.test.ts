import assert from "node:assert/strict";
import test from "node:test";
import { assertDocumentModel, buildFileShapeDocument } from "../src/document-model.js";
import type { InspectResult } from "../src/pdf-inspector.js";
import type { PhysicalPageLayout } from "../src/physical-layout.js";
import type { SemanticPageBlocks } from "../src/semantic-blocks.js";

test("document blocks retain first/last physical unit edge geometry", () => {
  const inspection = {
    file: "fixture.pdf",
    byteLength: 1,
    pageCount: 1,
    pages: [{
      page: 1,
      rotation: 0,
      textItems: [{ text: "body" }],
      imageOccurrences: [],
    }],
  } as unknown as InspectResult;

  const layout: PhysicalPageLayout = {
    orientation: "vertical",
    inlineSize: 1000,
    units: [{
      index: 0,
      position: 700,
      itemCount: 1,
      text: "body",
      sourceRanges: [{ page: 1, itemIndex: 0, charStart: 0, charEnd: 4 }],
      inlineStart: 100,
      inlineEnd: 920,
      inlineSpan: 820,
      inlineStartRatio: 0.1,
      inlineEndRatio: 0.92,
      inlineCoverageRatio: 0.82,
    }],
    gaps: [],
  };

  const semantic: SemanticPageBlocks = {
    blocks: [{
      index: 0,
      kind: "text",
      unitIndexes: [0],
      text: "body",
      sourceRanges: [{ page: 1, itemIndex: 0, charStart: 0, charEnd: 4 }],
    }],
    decisions: [],
    text: "body",
  };

  const document = buildFileShapeDocument({
    documentId: "edge-geometry",
    inspection,
    pages: [{ page: 1, orientation: "vertical", semantic, rubySpans: [], layout }],
  });

  assertDocumentModel(document);
  assert.deepEqual(document.pages[0]?.blocks[0]?.edgeGeometry, {
    firstUnitInlineStartRatio: 0.1,
    lastUnitInlineEndRatio: 0.92,
    lastUnitInlineCoverageRatio: 0.82,
  });
});

test("document validation rejects malformed retained edge geometry", () => {
  const inspection = {
    file: "fixture.pdf",
    byteLength: 1,
    pageCount: 1,
    pages: [{ page: 1, rotation: 0, textItems: [{ text: "body" }], imageOccurrences: [] }],
  } as unknown as InspectResult;
  const semantic: SemanticPageBlocks = {
    blocks: [{
      index: 0,
      kind: "text",
      unitIndexes: [0],
      text: "body",
      sourceRanges: [{ page: 1, itemIndex: 0, charStart: 0, charEnd: 4 }],
    }],
    decisions: [],
    text: "body",
  };
  const layout: PhysicalPageLayout = {
    orientation: "vertical",
    inlineSize: 1000,
    units: [{
      index: 0,
      position: 700,
      itemCount: 1,
      text: "body",
      sourceRanges: [{ page: 1, itemIndex: 0, charStart: 0, charEnd: 4 }],
      inlineStart: 100,
      inlineEnd: 920,
      inlineSpan: 820,
      inlineStartRatio: 0.1,
      inlineEndRatio: 0.92,
      inlineCoverageRatio: 0.82,
    }],
    gaps: [],
  };
  const document = buildFileShapeDocument({
    documentId: "bad-edge-geometry",
    inspection,
    pages: [{ page: 1, orientation: "vertical", semantic, rubySpans: [], layout }],
  });
  document.pages[0]!.blocks[0]!.edgeGeometry!.lastUnitInlineEndRatio = Number.NaN;
  assert.throws(() => assertDocumentModel(document), /invalid edge geometry/);
});
