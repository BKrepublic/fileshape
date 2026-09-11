import process from "node:process";
import { inspectPdf } from "./pdf-inspector.js";
import { reconstructPageFlow } from "./text-flow.js";

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

function reconstructionLooksConsistent(flow: ReturnType<typeof reconstructPageFlow>): boolean {
  if (flow.orientation === "unknown" || flow.text.trim().length === 0 || flow.groupCount === 0) {
    return false;
  }

  if (flow.metrics.singleCharItemRatio < 0.7) return true;

  if (flow.orientation === "vertical") {
    return (
      flow.metrics.sequenceVerticalRatio >= 0.6 &&
      flow.metrics.sequenceVerticalRatio > flow.metrics.sequenceHorizontalRatio
    );
  }

  return (
    flow.metrics.sequenceHorizontalRatio >= 0.6 &&
    flow.metrics.sequenceHorizontalRatio > flow.metrics.sequenceVerticalRatio
  );
}

async function main() {
  const { inputPath, pageNumber } = parseArgs(process.argv.slice(2));

  if (!inputPath) {
    console.error("Usage: npm run reconstruct:page -- <path-to-pdf> --page <number>");
    process.exitCode = 1;
    return;
  }

  try {
    const result = await inspectPdf(inputPath);
    const page = result.pages.find((candidate) => candidate.page === pageNumber);

    if (!page) {
      console.error("\n=== FileShape page reconstruction ===");
      console.error(`File: ${result.file}`);
      console.error(`Page: ${pageNumber}`);
      console.error("RESULT: FAIL (page does not exist)");
      process.exitCode = 1;
      return;
    }

    const flow = reconstructPageFlow(page);

    console.log("\n=== FileShape page reconstruction ===");
    console.log(`File: ${result.file}`);
    console.log(`Page: ${page.page}`);
    console.log(`Orientation: ${flow.orientation}`);
    console.log(`Body font size: ${flow.bodyFontSize}`);
    console.log(`Primary items: ${flow.primaryItemCount}`);
    console.log(`Annotations excluded: ${flow.annotationItemCount}`);
    console.log(`Margin noise excluded: ${flow.marginNoiseItemCount}`);
    console.log(`Groups: ${flow.groupCount}`);
    console.log(`Metrics: ${JSON.stringify(flow.metrics)}`);
    console.log("");
    console.log("--- reconstructed text ---");
    console.log(flow.text);
    console.log("--- end reconstructed text ---");
    console.log("");

    const passed = reconstructionLooksConsistent(flow);
    console.log(`RESULT: ${passed ? "PASS" : "FAIL"}`);
    if (!passed) process.exitCode = 1;
  } catch (error) {
    console.error("\n=== FileShape page reconstruction ===");
    console.error("RESULT: FAIL");
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  }
}

await main();
