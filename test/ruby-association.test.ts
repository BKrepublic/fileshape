import assert from "node:assert/strict";
import test from "node:test";
import type { InspectPage, InspectTextItem } from "../src/pdf-inspector.js";
import { associateRubyCandidates } from "../src/ruby-association.js";

function item(text: string, x: number, y: number, size: number, width: number, height: number): InspectTextItem {
  return { text, displayX: x, displayY: y, x, y, fontSize: size, width, height,
    dir: "ignored", fontName: "ignored", transform: [], displayTransform: [], hasEOL: false };
}

function fixture(horizontal = false): InspectPage {
  const textItems = [
    item("", 0, 0, 14, 0, 0),
    item("本文長文", 200, 100, 14, horizontal ? 56 : 14, horizontal ? 14 : 56),
    item("ほん", horizontal ? 214 : 211, horizontal ? 89 : 114, 7, horizontal ? 14 : 7, horizontal ? 7 : 14),
  ];
  return { page: 1, width: 600, height: 800, rotation: 0, userUnit: 1,
    view: [0, 0, 600, 800], textItemCount: textItems.length, imagePaintOps: 0, textItems };
}

for (const horizontal of [false, true]) {
  const orientation = horizontal ? "horizontal" : "vertical";
  test(`associates ${orientation} ruby candidates with source run indexes without mutation`, () => {
    const page = fixture(horizontal);
    const before = structuredClone(page);
    const [candidate] = associateRubyCandidates(page, orientation, 14);
    assert.equal(candidate?.status, "associated-run");
    assert.equal(candidate?.annotationItemIndex, 2);
    assert.deepEqual(candidate?.baseItemIndexes, [1]);
    assert.equal(candidate?.annotationText, "ほん");
    assert.equal(candidate?.inlineEnd! - candidate?.inlineStart!, 14);
    assert.deepEqual(page, before);
  });

  test(`retains distant and wrong-side ${orientation} small text as unresolved`, () => {
    for (const shift of [-40, 80]) {
      const page = fixture(horizontal);
      page.textItems[2]![horizontal ? "displayY" : "displayX"] += shift;
      const [candidate] = associateRubyCandidates(page, orientation, 14);
      assert.equal(candidate?.reason, "no-nearby-run");
      assert.deepEqual(candidate?.baseItemIndexes, []);
    }
  });
}

test("retains ambiguous overlapping base runs instead of choosing the first", () => {
  const page = fixture();
  page.textItems.push({ ...page.textItems[1]! });
  const [candidate] = associateRubyCandidates(page, "vertical", 14);
  assert.equal(candidate?.reason, "ambiguous-runs");
  assert.deepEqual(candidate?.baseItemIndexes, []);
});

test("unknown orientation preserves the small-text candidate without association", () => {
  assert.equal(associateRubyCandidates(fixture(), "unknown", 14)[0]?.reason, "unknown-orientation");
});

test("nearby small text without inline overlap is not ruby-associated", () => {
  const page = fixture();
  page.textItems[2]!.displayY = 300;
  assert.equal(associateRubyCandidates(page, "vertical", 14)[0]?.reason, "no-nearby-run");
});

test("invalid body size and body-sized text do not create ruby candidates", () => {
  const page = fixture();
  for (const size of [0, -1, NaN, Infinity]) assert.deepEqual(associateRubyCandidates(page, "vertical", size), []);
  page.textItems[2]!.fontSize = 14;
  assert.deepEqual(associateRubyCandidates(page, "vertical", 14), []);
});

test("scaled and translated geometry gives the same association", () => {
  const page = fixture();
  for (const entry of page.textItems) {
    entry.displayX = entry.displayX * 2 + 77;
    entry.displayY = entry.displayY * 2 + 31;
    entry.width *= 2;
    entry.height *= 2;
    entry.fontSize *= 2;
    entry.text = entry.text ? "arbitrary" : "";
    entry.fontName = "another-font";
    entry.dir = "rtl";
  }
  page.page = 99;
  assert.deepEqual(associateRubyCandidates(page, "vertical", 28)[0]?.baseItemIndexes, [1]);
});
