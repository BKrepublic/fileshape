import assert from "node:assert/strict";
import test from "node:test";
import {
  bodyFontRubyRolesStable,
  buildDocumentBodyFontContext,
} from "../src/body-font-context.js";
import type { InspectPage, InspectResult, InspectTextItem } from "../src/pdf-inspection-model.js";
import { buildDocumentFromInspection } from "../src/pdf-document-pipeline.js";
import { reconstructPageFlow } from "../src/text-flow.js";

function item(text: string, fontSize: number, y = 300): InspectTextItem {
  const width = Math.max(fontSize, [...text].length * fontSize);
  return {
    text,
    dir: "ltr",
    fontName: `F${fontSize}`,
    width,
    height: fontSize,
    transform: [fontSize, 0, 0, fontSize, 80, y],
    x: 80,
    y,
    displayTransform: [fontSize, 0, 0, fontSize, 80, y],
    displayX: 80,
    displayY: y,
    fontSize,
    hasEOL: false,
  };
}

function page(pageNumber: number, textItems: InspectTextItem[]): InspectPage {
  return {
    page: pageNumber,
    width: 600,
    height: 800,
    rotation: 0,
    userUnit: 1,
    view: [0, 0, 600, 800],
    textItemCount: textItems.length,
    imagePaintOps: 0,
    textItems,
  };
}

function strong(pageNumber: number, size: number): InspectPage {
  return page(pageNumber, [item("ordinary body text ordinary body text", size)]);
}

test("document majority resolves a weak local tie only when the prior size is observed", () => {
  const pages = [
    strong(1, 14),
    strong(2, 14),
    page(3, [item("aaaa", 14), item("bbbb", 16, 340)]),
  ];
  const context = buildDocumentBodyFontContext(pages);

  assert.deepEqual(context.prior, {
    size: 14,
    supportingPages: 2,
    eligiblePages: 2,
    supportRatio: 1,
  });
  const resolution = context.resolutions.get(3);
  assert.equal(resolution?.evidence.size, 16);
  assert.equal(resolution?.size, 14);
  assert.equal(resolution?.source, "document-prior");
  assert.equal(resolution?.reason, "document-prior");

  const flow = reconstructPageFlow(pages[2]!, undefined, resolution);
  assert.equal(flow.bodyFontSize, 14);
  assert.equal(flow.bodyFontEvidence.size, 16);
  assert.equal(flow.bodyFontSource, "document-prior");
});

test("strong page-local body size is never overwritten by the document prior", () => {
  const pages = [
    strong(1, 14),
    strong(2, 14),
    strong(3, 16),
  ];
  const context = buildDocumentBodyFontContext(pages);

  assert.equal(context.prior?.size, 14);
  assert.equal(context.resolutions.get(3)?.size, 16);
  assert.equal(context.resolutions.get(3)?.source, "page-local");
  assert.equal(context.resolutions.get(3)?.reason, "local-majority");
});

test("document prior does not invent a size absent from the weak page", () => {
  const pages = [
    strong(1, 14),
    strong(2, 14),
    page(3, [item("aaaa", 16), item("bbbb", 18, 340)]),
  ];
  const resolution = buildDocumentBodyFontContext(pages).resolutions.get(3);

  assert.equal(resolution?.evidence.size, 18);
  assert.equal(resolution?.size, 18);
  assert.equal(resolution?.reason, "prior-not-observed");
});

test("document prior fails closed when changing body size would change ruby roles", () => {
  const mixed = [item("aaaa", 14), item("bbbb", 20, 340)];
  assert.equal(bodyFontRubyRolesStable(mixed, 20, 14), false);

  const pages = [strong(1, 14), strong(2, 14), page(3, mixed)];
  const resolution = buildDocumentBodyFontContext(pages).resolutions.get(3);

  assert.equal(resolution?.evidence.size, 20);
  assert.equal(resolution?.size, 20);
  assert.equal(resolution?.source, "page-local");
  assert.equal(resolution?.reason, "ruby-role-change");
});

test("document prior is absent when strong pages do not have a strict majority", () => {
  const context = buildDocumentBodyFontContext([
    strong(1, 14),
    strong(2, 16),
  ]);

  assert.equal(context.prior, undefined);
  assert.equal(context.resolutions.get(1)?.reason, "no-document-prior");
  assert.equal(context.resolutions.get(2)?.reason, "no-document-prior");
});

test("document pipeline applies the same safe resolved body size to flow and layout", () => {
  const pages = [
    strong(1, 14),
    strong(2, 14),
    page(3, [item("aaaa", 14, 280), item("bbbb", 16, 340)]),
  ];
  const inspection: InspectResult = {
    file: "fixture.pdf",
    byteLength: 1,
    pageCount: pages.length,
    pages,
  };
  const rubySpans = new Map(pages.map((entry) => [entry.page, []]));
  const result = buildDocumentFromInspection(inspection, "body-font-context", rubySpans);
  const third = result.pages.find((entry) => entry.page === 3);

  assert.equal(third?.flow.bodyFontSize, 14);
  assert.equal(third?.flow.bodyFontSource, "document-prior");
  assert.equal(third?.flow.bodyFontEvidence.size, 16);
  assert.equal(result.document.pages[2]?.orientation, "horizontal");
  assert.ok((result.document.pages[2]?.blocks.length ?? 0) > 0);
});
