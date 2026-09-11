import process from "node:process";
import { inspectPdf } from "./pdf-inspector.js";
import { reconstructPageFlow } from "./text-flow.js";
import { resolveDocumentOrientations } from "./document-orientation.js";
import { associateRubySpans } from "./ruby-spans.js";

const input = process.argv[2];
if (!input) throw new Error("Usage: npm run diagnose:ruby -- <pdf> [page]");
const selectedPage = process.argv[3] === undefined ? undefined : Number(process.argv[3]);
const inspection = await inspectPdf(input, { includeGlyphs: true });
if (selectedPage !== undefined && (!Number.isInteger(selectedPage) || selectedPage < 1 || selectedPage > inspection.pageCount)) {
  throw new Error("Page must be an integer within the document");
}
const initial = inspection.pages.filter((page) => page.textItems.some((item) => item.text.trim()))
  .map((page) => ({ page, flow: reconstructPageFlow(page) }));
const orientations = new Map(resolveDocumentOrientations(initial.map(({ page, flow }) =>
  ({ page: page.page, orientation: flow.orientation }))).map((entry) => [entry.page, entry.resolved]));
for (const { page, flow } of initial) {
  if (selectedPage !== undefined && page.page !== selectedPage) continue;
  const candidates = associateRubySpans(page, flow.bodyFontSize);
  console.log(JSON.stringify({ page: page.page, bodyFontSize: flow.bodyFontSize,
    orientation: orientations.get(page.page), glyphIssues: page.glyphIssues, candidates }, null, 2));
}
