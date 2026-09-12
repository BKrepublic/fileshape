import assert from "node:assert/strict";
import test from "node:test";
import {
  crossDistanceBucket,
  fontRatioBucket,
  inlineGapBucket,
} from "../src/ruby-near-miss-evidence.js";
import { associateRubySpans } from "../src/ruby-spans.js";
import { glyphPage, rubyRuns } from "./glyph-fixtures.js";

test("near-miss buckets preserve production threshold boundaries", () => {
  assert.equal(fontRatioBucket(null), "none");
  assert.equal(fontRatioBucket(0.19), "<0.20");
  assert.equal(fontRatioBucket(0.2), "0.20-<0.35");
  assert.equal(fontRatioBucket(0.3499), "0.20-<0.35");
  assert.equal(fontRatioBucket(0.35), "0.35-<0.75");
  assert.equal(fontRatioBucket(0.7499), "0.35-<0.75");
  assert.equal(fontRatioBucket(0.75), "0.75-<1.00");

  assert.equal(crossDistanceBucket(-0.01), "<0");
  assert.equal(crossDistanceBucket(0), "0-<0.45");
  assert.equal(crossDistanceBucket(0.4499), "0-<0.45");
  assert.equal(crossDistanceBucket(0.45), "0.45-1.35");
  assert.equal(crossDistanceBucket(1.35), "0.45-1.35");
  assert.equal(crossDistanceBucket(1.3501), ">1.35-<2.00");

  assert.equal(inlineGapBucket(0), "overlap");
  assert.equal(inlineGapBucket(0.5), ">0-0.50");
  assert.equal(inlineGapBucket(0.5001), ">0.50-1.00");
  assert.equal(inlineGapBucket(1.1), ">1.00");
});

test("a structurally distant annotation remains no-base in the production classifier", () => {
  const runs = rubyRuns(true);
  runs[1]!.x = 230;
  const span = associateRubySpans(glyphPage(runs), 14)[0]!;
  assert.equal(span.status, "unresolved");
  assert.equal(span.reason, "no-base");
});

test("an annotation inside the accepted side-distance window remains exact", () => {
  const span = associateRubySpans(glyphPage(rubyRuns(true)), 14)[0]!;
  assert.equal(span.status, "exact");
  assert.equal(span.reason, "unique-contiguous-span");
});
