import process from "node:process";
import { inspectPdf } from "./pdf-inspector.js";
import { reconstructPageFlow } from "./text-flow.js";

function normalize(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

async function main() {
  const leftPath = process.argv[2];
  const rightPath = process.argv[3];

  if (!leftPath || !rightPath) {
    console.error("Usage: npm run compare:flow -- <left.pdf> <right.pdf>");
    process.exitCode = 1;
    return;
  }

  try {
    const [left, right] = await Promise.all([inspectPdf(leftPath), inspectPdf(rightPath)]);

    console.log("\n=== FileShape flow equality comparison ===");
    console.log("NOTE: equality between two outputs does not prove either output is textually correct.");
    console.log(`Left:  ${left.file}`);
    console.log(`Right: ${right.file}`);
    console.log(`Pages: ${left.pageCount} vs ${right.pageCount}`);

    const pageCountMatch = left.pageCount === right.pageCount;
    const maxPages = Math.max(left.pageCount, right.pageCount);
    const mismatches: Array<{
      page: number;
      reason: string;
      leftOrientation?: string;
      rightOrientation?: string;
      leftText?: string;
      rightText?: string;
    }> = [];

    for (let index = 0; index < maxPages; index += 1) {
      const leftPage = left.pages[index];
      const rightPage = right.pages[index];
      const pageNumber = index + 1;

      if (!leftPage || !rightPage) {
        mismatches.push({ page: pageNumber, reason: "page missing in one input" });
        continue;
      }

      const leftFlow = reconstructPageFlow(leftPage);
      const rightFlow = reconstructPageFlow(rightPage);
      const leftText = normalize(leftFlow.text);
      const rightText = normalize(rightFlow.text);

      if (leftFlow.orientation !== rightFlow.orientation || leftText !== rightText) {
        mismatches.push({
          page: pageNumber,
          reason:
            leftFlow.orientation !== rightFlow.orientation
              ? "orientation differs"
              : "reconstructed text differs",
          leftOrientation: leftFlow.orientation,
          rightOrientation: rightFlow.orientation,
          leftText: leftText.slice(0, 180),
          rightText: rightText.slice(0, 180),
        });
      }
    }

    console.log(`${pageCountMatch ? "PASS" : "FAIL"}  Page count match: ${pageCountMatch ? "yes" : "no"}`);
    console.log(`INFO  Compared pages: ${maxPages}`);
    console.log(`${mismatches.length === 0 ? "PASS" : "FAIL"}  Flow mismatches: ${mismatches.length}`);

    if (mismatches.length > 0) {
      console.log("\nFirst mismatches:");
      for (const mismatch of mismatches.slice(0, 10)) {
        console.log(`- page ${mismatch.page}: ${mismatch.reason}`);
        if (mismatch.leftOrientation || mismatch.rightOrientation) {
          console.log(`  orientation: ${mismatch.leftOrientation} / ${mismatch.rightOrientation}`);
        }
        if (mismatch.leftText !== undefined || mismatch.rightText !== undefined) {
          console.log(`  left:  ${JSON.stringify(mismatch.leftText ?? "")}`);
          console.log(`  right: ${JSON.stringify(mismatch.rightText ?? "")}`);
        }
      }
    }

    const passed = pageCountMatch && mismatches.length === 0;
    console.log("");
    console.log(`EQUALITY RESULT: ${passed ? "PASS" : "FAIL"}`);
    if (!passed) process.exitCode = 1;
  } catch (error) {
    console.error("\n=== FileShape flow equality comparison ===");
    console.error("EQUALITY RESULT: FAIL");
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  }
}

await main();
