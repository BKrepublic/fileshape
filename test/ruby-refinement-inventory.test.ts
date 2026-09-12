import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeRubyRefinementCandidate,
  summarizeRubyRefinementCorpus,
  type PdfRubyRefinementInventory,
} from "../src/ruby-refinement-inventory.js";
import { associateRubySpans, type RubySpan } from "../src/ruby-spans.js";
import { glyphPage, rubyRuns } from "./glyph-fixtures.js";

const PDF_ID = "sha256:0123456789abcdef";

function inventoryFromReports(candidateReports: PdfRubyRefinementInventory["candidateReports"]): PdfRubyRefinementInventory {
  const reasonCounts: Record<string, number> = {};
  const unresolvedReasonCounts: Record<string, number> = {};
  const orientationCounts: Record<string, number> = {};
  const rotationCounts: Record<string, number> = {};
  const annotationEvidenceCounts: Record<string, number> = {};
  const alternativeBucketCounts: Record<string, number> = {};
  const featureCounts: Record<string, number> = {};
  for (const report of candidateReports) {
    reasonCounts[report.reason] = (reasonCounts[report.reason] ?? 0) + 1;
    orientationCounts[report.orientation] = (orientationCounts[report.orientation] ?? 0) + 1;
    rotationCounts[String(report.rotation)] = (rotationCounts[String(report.rotation)] ?? 0) + 1;
    annotationEvidenceCounts[report.annotationEvidence] = (annotationEvidenceCounts[report.annotationEvidence] ?? 0) + 1;
    const bucket = report.alternativeCount === 0 ? "0" : report.alternativeCount === 1 ? "1" : "2+";
    alternativeBucketCounts[bucket] = (alternativeBucketCounts[bucket] ?? 0) + 1;
    if (report.status === "unresolved") unresolvedReasonCounts[report.reason] = (unresolvedReasonCounts[report.reason] ?? 0) + 1;
    const feature = [report.reason, report.orientation, `rot${report.rotation}`, report.annotationEvidence,
      `alts:${bucket}`, report.pageGlyphIssueCount > 0 ? "page-glyph-issues" : "page-glyph-clean"].join("|");
    featureCounts[feature] = (featureCounts[feature] ?? 0) + 1;
  }
  return {
    pdfId: PDF_ID,
    sourceSha256: "0".repeat(64),
    byteLength: 1,
    pages: 1,
    scannedPages: 1,
    candidates: candidateReports.length,
    exactCandidates: candidateReports.filter((candidate) => candidate.status === "exact").length,
    unresolvedCandidates: candidateReports.filter((candidate) => candidate.status === "unresolved").length,
    reasonCounts,
    unresolvedReasonCounts,
    orientationCounts,
    rotationCounts,
    annotationEvidenceCounts,
    alternativeBucketCounts,
    featureCounts,
    pageGlyphIssueCandidates: candidateReports.filter((candidate) => candidate.pageGlyphIssueCount > 0).length,
    sourceIntegrityIssues: [],
    unknownReasonCount: candidateReports.filter((candidate) => !candidate.knownReason).length,
    candidateReports,
  };
}

test("inventory records exact source-backed ruby without storing source text", () => {
  const page = glyphPage(rubyRuns(), 90);
  const span = associateRubySpans(page, 14)[0]!;
  const analyzed = analyzeRubyRefinementCandidate(PDF_ID, page, "vertical", 14, span);
  assert.equal(analyzed.report.status, "exact");
  assert.equal(analyzed.report.reason, "unique-contiguous-span");
  assert.equal(analyzed.report.annotationEvidence, "all-exact-with-geometry");
  assert.equal(analyzed.report.rotation, 90);
  assert.equal(analyzed.report.annotationFontRatioMin, 0.5);
  assert.equal(analyzed.report.annotationFontRatioMax, 0.5);
  assert.equal(analyzed.report.alternativeCount, 1);
  assert.deepEqual(analyzed.sourceIssues, []);
  assert.match(analyzed.report.candidateId, /^[0-9a-f]{20}$/);
  assert.equal("text" in analyzed.report, false);
});

test("ambiguous bases remain explicit and keep all alternatives", () => {
  const runs = rubyRuns();
  runs.push({ ...runs[0]!, x: 197 });
  const page = glyphPage(runs);
  const span = associateRubySpans(page, 14)[0]!;
  const analyzed = analyzeRubyRefinementCandidate(PDF_ID, page, "vertical", 14, span);
  assert.equal(analyzed.report.status, "unresolved");
  assert.equal(analyzed.report.reason, "ambiguous-base");
  assert.equal(analyzed.report.alternativeCount, 2);
  assert.equal(analyzed.report.annotationEvidence, "all-exact-with-geometry");
  assert.deepEqual(analyzed.report.baseSourceRanges, []);
});

test("missing annotation glyph mapping is classified structurally instead of guessed", () => {
  const page = glyphPage(rubyRuns());
  page.textItems[1]!.glyphMapping = "unmapped";
  page.textItems[1]!.glyphs = [];
  const span = associateRubySpans(page, 14)[0]!;
  const analyzed = analyzeRubyRefinementCandidate(PDF_ID, page, "vertical", 14, span);
  assert.equal(span.reason, "missing-glyph-geometry");
  assert.equal(analyzed.report.annotationEvidence, "has-unmapped-glyph-mapping");
  assert.equal(analyzed.report.annotationGlyphCount, 0);
});

test("candidate identity depends on PDF/page/source ranges, not current resolution reason", () => {
  const page = glyphPage(rubyRuns());
  const exact = associateRubySpans(page, 14)[0]!;
  const unresolved: RubySpan = {
    ...exact,
    status: "unresolved",
    reason: "no-base",
    baseSourceRanges: [],
    baseGlyphRefs: [],
    alternatives: [],
  };
  const left = analyzeRubyRefinementCandidate(PDF_ID, page, "vertical", 14, exact).report;
  const right = analyzeRubyRefinementCandidate(PDF_ID, page, "vertical", 14, unresolved).report;
  assert.equal(left.candidateId, right.candidateId);
});

test("invalid source ranges are surfaced as integrity issues", () => {
  const page = glyphPage(rubyRuns());
  const span = structuredClone(associateRubySpans(page, 14)[0]!);
  span.annotationSourceRanges[0]!.charEnd = 999;
  const analyzed = analyzeRubyRefinementCandidate(PDF_ID, page, "vertical", 14, span);
  assert.equal(analyzed.sourceIssues.length, 1);
  assert.match(analyzed.sourceIssues[0]!, /invalid source range/);
});

test("corpus summary reconciles exact/unresolved and structural buckets", () => {
  const exactPage = glyphPage(rubyRuns(), 0);
  const exact = analyzeRubyRefinementCandidate(PDF_ID, exactPage, "vertical", 14,
    associateRubySpans(exactPage, 14)[0]!).report;
  const ambiguousRuns = rubyRuns();
  ambiguousRuns.push({ ...ambiguousRuns[0]!, x: 197 });
  const ambiguousPage = glyphPage(ambiguousRuns, 180);
  const ambiguous = analyzeRubyRefinementCandidate(PDF_ID, ambiguousPage, "vertical", 14,
    associateRubySpans(ambiguousPage, 14)[0]!).report;
  const corpus = summarizeRubyRefinementCorpus([inventoryFromReports([exact, ambiguous])]);
  assert.equal(corpus.candidates, 2);
  assert.equal(corpus.exactCandidates, 1);
  assert.equal(corpus.unresolvedCandidates, 1);
  assert.deepEqual(corpus.unresolvedReasonCounts, { "ambiguous-base": 1 });
  assert.equal(corpus.alternativeBucketCounts["1"], 1);
  assert.equal(corpus.alternativeBucketCounts["2+"], 1);
  assert.equal(corpus.sourceIntegrityIssues, 0);
  assert.equal(corpus.unknownReasonCount, 0);
});
