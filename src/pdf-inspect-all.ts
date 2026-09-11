import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { inspectPdf, type InspectResult } from "./pdf-inspector.js";

type PdfSummary = {
  file: string;
  byteLength: number;
  pageCount: number;
  textPages: number;
  totalTextItems: number;
  totalCharacters: number;
  avgCharsPerItem: number;
  singleCharItemRatio: number;
  imagePaintOps: number;
  rotations: number[];
  pageSizes: string[];
  directions: Record<string, number>;
  fontSizeRange: { min: number | null; max: number | null };
  topFontSizes: Array<{ size: number; count: number }>;
};

type ScanRecord =
  | { status: "PASS"; summary: PdfSummary }
  | { status: "FAIL"; file: string; error: string };

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function summarize(result: InspectResult): PdfSummary {
  let textPages = 0;
  let totalTextItems = 0;
  let totalCharacters = 0;
  let singleCharItems = 0;
  let imagePaintOps = 0;
  let minFontSize = Number.POSITIVE_INFINITY;
  let maxFontSize = Number.NEGATIVE_INFINITY;

  const rotations = new Set<number>();
  const pageSizes = new Set<string>();
  const directions = new Map<string, number>();
  const fontSizes = new Map<number, number>();

  for (const page of result.pages) {
    if (page.textItemCount > 0) textPages += 1;
    totalTextItems += page.textItemCount;
    imagePaintOps += page.imagePaintOps;
    rotations.add(page.rotation);
    pageSizes.add(`${round(page.width)}x${round(page.height)}`);

    for (const item of page.textItems) {
      const charCount = Array.from(item.text).length;
      totalCharacters += charCount;
      if (charCount <= 1) singleCharItems += 1;

      directions.set(item.dir, (directions.get(item.dir) ?? 0) + 1);

      const size = round(item.fontSize, 2);
      minFontSize = Math.min(minFontSize, size);
      maxFontSize = Math.max(maxFontSize, size);
      fontSizes.set(size, (fontSizes.get(size) ?? 0) + 1);
    }
  }

  const topFontSizes = [...fontSizes.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 6)
    .map(([size, count]) => ({ size, count }));

  return {
    file: result.file,
    byteLength: result.byteLength,
    pageCount: result.pageCount,
    textPages,
    totalTextItems,
    totalCharacters,
    avgCharsPerItem: totalTextItems === 0 ? 0 : round(totalCharacters / totalTextItems, 3),
    singleCharItemRatio: totalTextItems === 0 ? 0 : round(singleCharItems / totalTextItems, 4),
    imagePaintOps,
    rotations: [...rotations].sort((a, b) => a - b),
    pageSizes: [...pageSizes].sort(),
    directions: Object.fromEntries([...directions.entries()].sort(([a], [b]) => a.localeCompare(b))),
    fontSizeRange: {
      min: Number.isFinite(minFontSize) ? minFontSize : null,
      max: Number.isFinite(maxFontSize) ? maxFontSize : null,
    },
    topFontSizes,
  };
}

function printSummary(summary: PdfSummary) {
  console.log(`\nPASS  ${summary.file}`);
  console.log(`  pages: ${summary.pageCount} (${summary.textPages} with text)`);
  console.log(`  textItems: ${summary.totalTextItems.toLocaleString()}`);
  console.log(`  characters: ${summary.totalCharacters.toLocaleString()}`);
  console.log(`  avgCharsPerItem: ${summary.avgCharsPerItem}`);
  console.log(`  singleCharItemRatio: ${summary.singleCharItemRatio}`);
  console.log(`  imagePaintOps: ${summary.imagePaintOps}`);
  console.log(`  rotations: ${summary.rotations.join(", ") || "none"}`);
  console.log(`  pageSizes: ${summary.pageSizes.join(", ") || "none"}`);
  console.log(`  directions: ${JSON.stringify(summary.directions)}`);
  console.log(
    `  fontSizeRange: ${summary.fontSizeRange.min ?? "n/a"}..${summary.fontSizeRange.max ?? "n/a"}`,
  );
  console.log(
    `  topFontSizes: ${summary.topFontSizes.map((entry) => `${entry.size}(${entry.count})`).join(", ") || "none"}`,
  );
}

function parseArguments(args: string[]): {
  directory: string;
  outputPath: string | undefined;
} {
  const directory = args[0] && !args[0].startsWith("--") ? args[0] : "local-samples";
  let outputPath: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--output") {
      outputPath = args[index + 1];
      index += 1;
    }
  }

  return { directory, outputPath };
}

async function main() {
  const { directory, outputPath } = parseArguments(process.argv.slice(2));
  const entries = await readdir(directory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "ja"));

  console.log("=== FileShape batch PDF structure scan ===");
  console.log(`Directory: ${path.resolve(directory)}`);
  console.log(`PDFs: ${files.length}`);

  if (files.length === 0) {
    console.log("\nRESULT: FAIL");
    console.log("No PDF files found.");
    process.exitCode = 1;
    return;
  }

  const records: ScanRecord[] = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]!;
    console.log(`\n[${index + 1}/${files.length}] ${file}`);

    try {
      const result = await inspectPdf(path.join(directory, file));
      const summary = summarize(result);
      records.push({ status: "PASS", summary });
      printSummary(summary);
    } catch (error) {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      records.push({ status: "FAIL", file, error: message });
      console.log(`\nFAIL  ${file}`);
      console.log(`  ${message}`);
    }
  }

  if (outputPath) {
    await writeFile(outputPath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
    console.log(`\nJSON: ${outputPath}`);
  }

  const passed = records.filter((record) => record.status === "PASS").length;
  const failed = records.length - passed;

  console.log("\n=== Batch result ===");
  console.log(`PASS: ${passed}/${records.length}`);
  console.log(`FAIL: ${failed}/${records.length}`);
  console.log(`RESULT: ${failed === 0 ? "PASS" : "FAIL"}`);

  if (failed > 0) process.exitCode = 1;
}

await main();
