import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { inspectPdf } from "./pdf-inspector.js";
import { associateRubySpans } from "./ruby-spans.js";
import { reconstructPageFlow } from "./text-flow.js";

function increment(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

function ratioBucket(value: number): string {
  if (value < 0.5) return "<0.50";
  if (value < 0.6) return "0.50-<0.60";
  if (value < 0.7) return "0.60-<0.70";
  return "0.70-<0.75";
}

async function main(): Promise<void> {
  const input = process.argv[2];
  if (!input) throw new Error("usage: npm run diagnose:ruby-unresolved-position -- PDF");

  const inspection = await inspectPdf(input, { includeGlyphs: true });
  const reasonCounts: Record<string, number> = {};
  const edgeCounts: Record<string, number> = {};
  const reasonEdgeCounts: Record<string, number> = {};
  const fontRatioCounts: Record<string, number> = {};
  let unresolved = 0;

  for (const page of inspection.pages) {
    const flow = reconstructPageFlow(page);
    const spans = associateRubySpans(page, flow.bodyFontSize);
    for (const span of spans) {
      if (span.status !== "unresolved") continue;
      unresolved += 1;
      increment(reasonCounts, span.reason);

      const indexes = [...new Set(span.annotationSourceRanges.map((range) => range.itemIndex))];
      const items = indexes.map((index) => page.textItems[index]).filter((item) => item !== undefined);
      if (items.length === 0) continue;

      const xRatio = items.reduce((sum, item) => sum + item.displayX / Math.max(1, page.width), 0) / items.length;
      const yRatio = items.reduce((sum, item) => sum + item.displayY / Math.max(1, page.height), 0) / items.length;
      const fontRatio = items.reduce((sum, item) => sum + item.fontSize / Math.max(0.001, flow.bodyFontSize), 0) / items.length;

      const edges: string[] = [];
      if (yRatio <= 0.10) edges.push("top<=0.10");
      if (yRatio >= 0.88) edges.push("bottom>=0.88");
      if (xRatio <= 0.08) edges.push("left<=0.08");
      if (xRatio >= 0.92) edges.push("right>=0.92");
      if (edges.length === 0) edges.push("interior");

      for (const edge of edges) {
        increment(edgeCounts, edge);
        increment(reasonEdgeCounts, `${span.reason}|${edge}`);
      }
      increment(fontRatioCounts, ratioBucket(fontRatio));
    }
  }

  process.stdout.write([
    `FILE=${path.basename(input)}`,
    `PAGES=${inspection.pageCount}`,
    `UNRESOLVED=${unresolved}`,
    `REASON_COUNTS=${JSON.stringify(reasonCounts)}`,
    `EDGE_COUNTS=${JSON.stringify(edgeCounts)}`,
    `REASON_EDGE_COUNTS=${JSON.stringify(reasonEdgeCounts)}`,
    `FONT_RATIO_COUNTS=${JSON.stringify(fontRatioCounts)}`,
    "NOTE=position buckets are diagnostics only, not production thresholds",
  ].join("\n") + "\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
