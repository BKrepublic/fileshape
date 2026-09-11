import process from "node:process";
import { inspectPdf, type InspectTextItem } from "./pdf-inspector.js";

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function alignedNeighborRatio(
  items: InspectTextItem[],
  coordinate: "raw" | "display",
  axis: "x" | "y",
  tolerance: number,
  maxAdvance: number,
): number {
  if (items.length < 2) return 0;

  let aligned = 0;

  for (let index = 0; index < items.length; index += 1) {
    const current = items[index];
    if (!current) continue;

    const currentX = coordinate === "display" ? current.displayX : current.x;
    const currentY = coordinate === "display" ? current.displayY : current.y;
    let found = false;

    for (let otherIndex = 0; otherIndex < items.length; otherIndex += 1) {
      if (index === otherIndex) continue;
      const other = items[otherIndex];
      if (!other) continue;

      const otherX = coordinate === "display" ? other.displayX : other.x;
      const otherY = coordinate === "display" ? other.displayY : other.y;
      const dx = Math.abs(currentX - otherX);
      const dy = Math.abs(currentY - otherY);

      if (axis === "x") {
        if (dx <= tolerance && dy > tolerance && dy <= maxAdvance) {
          found = true;
          break;
        }
      } else if (dy <= tolerance && dx > tolerance && dx <= maxAdvance) {
        found = true;
        break;
      }
    }

    if (found) aligned += 1;
  }

  return aligned / items.length;
}

function parseArgs(args: string[]): { inputPath: string | undefined; pageNumber: number } {
  const inputPath = args[0];
  let pageNumber = 1;

  for (let index = 1; index < args.length; index += 1) {
    if (args[index] === "--page") {
      const parsed = Number(args[index + 1]);
      if (Number.isInteger(parsed) && parsed > 0) pageNumber = parsed;
      index += 1;
    }
  }

  return { inputPath, pageNumber };
}

async function main() {
  const { inputPath, pageNumber } = parseArgs(process.argv.slice(2));

  if (!inputPath) {
    console.error("Usage: npm run probe:layout -- <path-to-pdf> --page <number>");
    process.exitCode = 1;
    return;
  }

  try {
    const result = await inspectPdf(inputPath);
    const page = result.pages.find((candidate) => candidate.page === pageNumber);

    if (!page) {
      console.error("\n=== FileShape geometry probe ===");
      console.error(`File: ${result.file}`);
      console.error(`Page: ${pageNumber}`);
      console.error("RESULT: FAIL (page does not exist)");
      process.exitCode = 1;
      return;
    }

    const items = page.textItems.filter((item) => item.text.trim().length > 0);
    const fontSizes = items.map((item) => item.fontSize).filter((size) => size > 0);
    const medianFontSize = median(fontSizes);
    const tolerance = Math.max(1.25, medianFontSize * 0.22);
    const maxAdvance = Math.max(12, medianFontSize * 4.5);
    const singleCharItems = items.filter((item) => [...item.text].length === 1).length;
    const multiCharItems = items.filter((item) => [...item.text].length >= 2);
    const verticalRuns = multiCharItems.filter((item) => item.height > item.width * 1.5).length;
    const horizontalRuns = multiCharItems.filter((item) => item.width > item.height * 1.5).length;

    const report = {
      file: result.file,
      page: page.page,
      pageRotation: page.rotation,
      pageSize: `${round(page.width, 2)}x${round(page.height, 2)}`,
      textItems: items.length,
      characters: items.reduce((sum, item) => sum + [...item.text].length, 0),
      medianFontSize: round(medianFontSize),
      singleCharItemRatio: round(items.length === 0 ? 0 : singleCharItems / items.length, 4),
      multiCharRunShape: {
        verticalElongatedRatio: round(
          multiCharItems.length === 0 ? 0 : verticalRuns / multiCharItems.length,
          4,
        ),
        horizontalElongatedRatio: round(
          multiCharItems.length === 0 ? 0 : horizontalRuns / multiCharItems.length,
          4,
        ),
      },
      rawAlignment: {
        sameXNeighborRatio: round(alignedNeighborRatio(items, "raw", "x", tolerance, maxAdvance), 4),
        sameYNeighborRatio: round(alignedNeighborRatio(items, "raw", "y", tolerance, maxAdvance), 4),
      },
      displayAlignment: {
        sameXNeighborRatio: round(
          alignedNeighborRatio(items, "display", "x", tolerance, maxAdvance),
          4,
        ),
        sameYNeighborRatio: round(
          alignedNeighborRatio(items, "display", "y", tolerance, maxAdvance),
          4,
        ),
      },
      sample: items.slice(0, 12).map((item) => ({
        text: item.text,
        raw: [round(item.x, 2), round(item.y, 2)],
        display: [round(item.displayX, 2), round(item.displayY, 2)],
        size: round(item.fontSize, 2),
        width: round(item.width, 2),
        height: round(item.height, 2),
      })),
    };

    console.log("\n=== FileShape geometry probe ===");
    console.log(JSON.stringify(report, null, 2));
    console.log("");
    console.log(`RESULT: ${items.length > 0 ? "PASS" : "FAIL"}`);
    if (items.length === 0) process.exitCode = 1;
  } catch (error) {
    console.error("\n=== FileShape geometry probe ===");
    console.error("RESULT: FAIL");
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  }
}

await main();
