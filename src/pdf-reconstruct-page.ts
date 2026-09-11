import process from "node:process";
import { renderPageFlowText } from "./flow-render.js";
import { inspectPdf } from "./pdf-inspector.js";
import { reconstructPageFlow } from "./text-flow.js";

type SpacingMode = "logical" | "preserve" | "cap";

function parseArgs(args: string[]): {
  inputPath: string | undefined;
  pageNumber: number;
  spacingMode: SpacingMode;
  maxLineBreaks: number;
} {
  const inputPath = args[0];
  let pageNumber = 1;
  let spacingMode: SpacingMode = "logical";
  let maxLineBreaks = 2;

  for (let index = 1; index < args.length; index += 1) {
    if (args[index] === "--page") {
      const parsed = Number(args[index + 1]);
      if (Number.isInteger(parsed) && parsed > 0) pageNumber = parsed;
      index += 1;
      continue;
    }

    if (args[index] === "--spacing") {
      const candidate = args[index + 1];
      if (candidate === "logical" || candidate === "preserve" || candidate === "cap") {
        spacingMode = candidate;
      }
      index += 1;
      continue;
    }

    if (args[index] === "--max-line-breaks") {
      const parsed = Number(args[index + 1]);
      if (Number.isInteger(parsed) && parsed > 0) maxLineBreaks = parsed;
      index += 1;
    }
  }

  return { inputPath, pageNumber, spacingMode, maxLineBreaks };
}

function reconstructionLooksStructurallyConsistent(
  flow: ReturnType<typeof reconstructPageFlow>,
): boolean {
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

function renderSelectedText(
  flow: ReturnType<typeof reconstructPageFlow>,
  spacingMode: SpacingMode,
  maxLineBreaks: number,
): string {
  if (spacingMode === "logical") return flow.text;
  if (spacingMode === "preserve") {
    return renderPageFlowText(flow, { mode: "preserve" });
  }
  return renderPageFlowText(flow, {
    mode: "cap",
    maxConsecutiveLineBreaks: maxLineBreaks,
  });
}

async function main() {
  const { inputPath, pageNumber, spacingMode, maxLineBreaks } = parseArgs(
    process.argv.slice(2),
  );

  if (!inputPath) {
    console.error(
      "Usage: npm run reconstruct:page -- <path-to-pdf> --page <number> [--spacing logical|preserve|cap] [--max-line-breaks <n>]",
    );
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
      console.error("STRUCTURE RESULT: FAIL (page does not exist)");
      process.exitCode = 1;
      return;
    }

    const flow = reconstructPageFlow(page);
    const renderedText = renderSelectedText(flow, spacingMode, maxLineBreaks);

    console.log("\n=== FileShape page reconstruction ===");
    console.log("NOTE: this command checks structural consistency, not textual fidelity.");
    console.log(`File: ${result.file}`);
    console.log(`Page: ${page.page}`);
    console.log(`Orientation: ${flow.orientation}`);
    console.log(`Body font size: ${flow.bodyFontSize}`);
    console.log(`Primary items: ${flow.primaryItemCount}`);
    console.log(`Annotations excluded: ${flow.annotationItemCount}`);
    console.log(`Margin noise excluded: ${flow.marginNoiseItemCount}`);
    console.log(`Logical groups: ${flow.groupCount}`);
    console.log(`Spacing boundaries: ${flow.boundaries.length}`);
    if (flow.boundaries.length > 0) {
      console.log(
        `Estimated source breaks: ${flow.boundaries.map((boundary) => boundary.estimatedLineBreaks).join(",")}`,
      );
    }
    console.log(`Spacing mode: ${spacingMode}${spacingMode === "cap" ? ` (max ${maxLineBreaks})` : ""}`);
    console.log(`Metrics: ${JSON.stringify(flow.metrics)}`);
    console.log("");
    console.log("--- reconstructed text ---");
    console.log(renderedText);
    console.log("--- end reconstructed text ---");
    console.log("");

    const passed = reconstructionLooksStructurallyConsistent(flow);
    console.log(`STRUCTURE RESULT: ${passed ? "PASS" : "FAIL"}`);
    if (!passed) process.exitCode = 1;
  } catch (error) {
    console.error("\n=== FileShape page reconstruction ===");
    console.error("STRUCTURE RESULT: FAIL");
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  }
}

await main();
