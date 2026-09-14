import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDocumentMarginProfile,
  marginRecurrenceForItem,
} from "../src/margin-recurrence.js";
import type { InspectPage, InspectTextItem } from "../src/pdf-inspection-model.js";
import { reconstructPhysicalLayout } from "../src/physical-layout.js";
import { collectTextItemEvidence } from "../src/text-item-evidence.js";
import { estimateBodyFontSize, reconstructPageFlow } from "../src/text-flow.js";

function item(
  text: string,
  fontName: string,
  fontSize: number,
  displayX: number,
  displayY: number,
  width = Math.max(fontSize, text.length * fontSize),
): InspectTextItem {
  return {
    text,
    dir: "ltr",
    fontName,
    width,
    height: fontSize,
    transform: [fontSize, 0, 0, fontSize, displayX, displayY],
    x: displayX,
    y: displayY,
    displayTransform: [fontSize, 0, 0, fontSize, displayX, displayY],
    displayX,
    displayY,
    fontSize,
    hasEOL: false,
  };
}

function page(
  pageNumber: number,
  footer?: { x?: number; fontName?: string; text?: string },
): InspectPage {
  const textItems = [
    item(`ordinary body text for page ${pageNumber}`.repeat(3), "Body", 14, 100, 300, 320),
  ];
  if (footer) {
    textItems.push(item(
      footer.text ?? `p${pageNumber}`,
      footer.fontName ?? "Footer",
      11,
      footer.x ?? 280,
      750,
      20,
    ));
  }
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

function profileFor(pages: InspectPage[]) {
  const bodyFontSizes = new Map(
    pages.map((entry) => [entry.page, estimateBodyFontSize(entry.textItems)]),
  );
  return buildDocumentMarginProfile(pages, bodyFontSizes);
}

test("recurring edge geometry and opaque style promote a local candidate to margin noise", () => {
  const pages = [
    page(1, {}),
    page(2, {}),
    page(3, {}),
    page(4, { fontName: "OneOffNote", text: "note" }),
    page(5),
  ];
  const profile = profileFor(pages);

  const recurring = marginRecurrenceForItem(profile, 1, 1);
  assert.equal(recurring?.pageSupport, 3);
  assert.equal(recurring?.supportRatio, 0.6);
  assert.equal(recurring?.recurring, true);

  const oneOff = marginRecurrenceForItem(profile, 4, 1);
  assert.equal(oneOff?.pageSupport, 1);
  assert.equal(oneOff?.recurring, false);

  const recurringEvidence = collectTextItemEvidence(pages[0]!, 14, profile)[1];
  assert.equal(recurringEvidence?.marginEvidence.localCandidate, true);
  assert.equal(recurringEvidence?.marginNoise, true);

  const retainedEvidence = collectTextItemEvidence(pages[3]!, 14, profile)[1];
  assert.equal(retainedEvidence?.marginEvidence.localCandidate, true);
  assert.equal(retainedEvidence?.marginNoise, false);

  // Direct page-local consumers retain the legacy behaviour when no document
  // profile is available.
  assert.equal(collectTextItemEvidence(pages[3]!, 14)[1]?.marginNoise, true);
});

test("flow and physical layout consume the same document recurrence decision", () => {
  const pages = [
    page(1, {}),
    page(2, {}),
    page(3, {}),
    page(4, { fontName: "OneOffNote", text: "note" }),
    page(5),
  ];
  const profile = profileFor(pages);

  const repeatedFlow = reconstructPageFlow(pages[0]!, profile);
  const retainedFlow = reconstructPageFlow(pages[3]!, profile);
  assert.equal(repeatedFlow.marginNoiseItemCount, 1);
  assert.equal(retainedFlow.marginNoiseItemCount, 0);
  assert.equal(retainedFlow.primaryItemCount, 2);

  const repeatedLayout = reconstructPhysicalLayout(pages[0]!, "horizontal", 14, profile);
  const retainedLayout = reconstructPhysicalLayout(pages[3]!, "horizontal", 14, profile);
  assert.equal(repeatedLayout.units.length, 1);
  assert.equal(retainedLayout.units.length, 2);
  assert.match(retainedLayout.units.map((unit) => unit.text).join("|"), /note/);
});

test("alternating inline positions can form independent recurring margin clusters", () => {
  const pages = Array.from({ length: 10 }, (_, index) =>
    page(index + 1, { x: index % 2 === 0 ? 80 : 500 }));
  const profile = profileFor(pages);

  const left = marginRecurrenceForItem(profile, 1, 1);
  const right = marginRecurrenceForItem(profile, 2, 1);
  assert.equal(left?.pageSupport, 5);
  assert.equal(right?.pageSupport, 5);
  assert.equal(left?.recurring, true);
  assert.equal(right?.recurring, true);
});

test("two matching edge candidates in a long document are not enough recurrence", () => {
  const pages = Array.from({ length: 20 }, (_, index) =>
    page(index + 1, index < 2 ? {} : undefined));
  const profile = profileFor(pages);

  const evidence = marginRecurrenceForItem(profile, 1, 1);
  assert.equal(evidence?.pageSupport, 2);
  assert.equal(evidence?.supportRatio, 0.1);
  assert.equal(evidence?.recurring, false);
  assert.equal(collectTextItemEvidence(pages[0]!, 14, profile)[1]?.marginNoise, false);
});
