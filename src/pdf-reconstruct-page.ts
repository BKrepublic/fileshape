import process from "node:process";
import { renderPageFlowText } from "./flow-render.js";
import { inspectPdf } from "./pdf-inspector.js";
import { reconstructPhysicalLayout } from "./physical-layout.js";
import { buildSemanticBlocks } from "./semantic-blocks.js";
import { reconstructPageFlow } from "./text-flow.js";

type SpacingMode = "logical" | "preserve" | "cap";

function parseArgs(args: string[]): {
  inputPath: string | undefined;
  pageNumber: number;
  spacingMode: SpacingMode;
  maxLineBreaks: number;
  showPhysical: boolean;
  showSemantic: boolean;
} {
  const inputPath = args[0];
  let pageNumber = 1;
  let spacingMode: SpacingMode = "logical";
  let maxLineBreaks = 2;
  let showPhysical = false;
  let showSemantic = false;

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
      continue;
    }

    if (args[index] === "--show-physical") {
      showPhysical = true;
      continue;
    }

    if (args[index] === "--show-semantic") {
      showSemantic = true;
    }
  }

  return { inputPath, pageNumber, spacingMode, maxLineBreaks, showPhysical, showSemantic };
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

function printPasteError(message: string): void {
  console.error("");
  console.error("============================================================");
  console.error("!!! FILESHAPE ERROR — この枠をそのまま貼ってください !!!");
  console.error("============================================================");
  console.error(message);
  console.error("============================================================");
  console.error("!!! END FILESHAPE ERROR !!!");
  console.error("============================================================");
}

async function main() {
  const {
    inputPath,
    pageNumber,
    spacingMode,
    maxLineBreaks,
    showPhysical,
    showSemantic,
  } = parseArgs(process.argv.slice(2));

  if (!inputPath) {
    printPasteError(
      "Usage: npm run reconstruct:page -- <path-to-pdf> --page <number> [--spacing logical|preserve|cap] [--max-line-breaks <n>] [--show-physical] [--show-semantic]",
    );
    process.exitCode = 1;
    return;
  }

  try {
    const result = await inspectPdf(inputPath);
    const page = result.pages.find((candidate) => candidate.page === pageNumber);

    if (!page) {
      printPasteError(`File: ${result.file}\nPage: ${pageNumber}\nSTRUCTURE RESULT: FAIL (page does not exist)`);
      process.exitCode = 1;
      return;
    }

    const flow = reconstructPageFlow(page);
    const renderedText = renderSelectedText(flow, spacingMode, maxLineBreaks);
    const physical = reconstructPhysicalLayout(page, flow.orientation, flow.bodyFontSize);
    const semantic = buildSemanticBlocks(physical, flow.bodyFontSize);

    console.log("\n=== FileShape page reconstruction ===");
    console.log("NOTE: this command checks structural consistency, not textual fidelity.");
    console.log(`File: ${result.file}`);
    console.log(`Page: ${page.page}`);
    console.log(`Orientation: ${flow.orientation}`);
    console.log(`Body font size: ${flow.bodyFontSize}`);
    console.log(`Primary items: ${flow.primaryItemCount}`);
    console.log(`Annotations excluded: ${flow.annotationItemCount}`);
    console.log(`Margin noise excluded: ${flow.marginNoiseItemCount}`);
    console.log(`Physical units preserved: ${physical.units.length}`);
    console.log(`Semantic blocks: ${semantic.blocks.length}`);
    console.log(`Logical groups: ${flow.groupCount}`);
    console.log(`Spacing boundaries: ${flow.boundaries.length}`);
    if (flow.boundaries.length > 0) {
      console.log(
        `Estimated source breaks: ${flow.boundaries.map((boundary) => boundary.estimatedLineBreaks).join(",")}`,
      );
    }
    console.log(`Spacing mode: ${spacingMode}${spacingMode === "cap" ? ` (max ${maxLineBreaks})` : ""}`);
    console.log(`Metrics: ${JSON.stringify(flow.metrics)}`);

    if (showPhysical) {
      console.log("");
      console.log("--- physical units ---");
      for (const unit of physical.units) {
        const nextGap = physical.gaps.find((gap) => gap.fromUnit === unit.index);
        console.log(
          `[${unit.index}] pos=${unit.position} gapAfter=${nextGap?.distance ?? "-"} inline=${unit.inlineStartRatio}..${unit.inlineEndRatio} ${unit.text}`,
        );
      }
      console.log("--- end physical units ---");
    }

    if (showSemantic) {
      console.log("");
      console.log("--- semantic boundary decisions ---");
      for (const decision of semantic.decisions) {
        console.log(
          `[${decision.fromUnit}->${decision.toUnit}] ${decision.join ? "JOIN" : "BREAK"} reason=${decision.reason} gapRatio=${decision.gapRatio} prevEnd=${decision.previousEndRatio} nextStart=${decision.nextStartRatio}`,
        );
      }
      console.log("--- end semantic boundary decisions ---");
      console.log("");
      console.log("--- semantic blocks ---");
      for (const block of semantic.blocks) {
        console.log(`[${block.index}] units=${block.unitIndexes.join(",")} ${block.text}`);
      }
      console.log("--- end semantic blocks ---");
      console.log("");
      console.log("--- semantic text ---");
      console.log(semantic.text);
      console.log("--- end semantic text ---");
    }

    console.log("");
    console.log("--- reconstructed text ---");
    console.log(renderedText);
    console.log("--- end reconstructed text ---");
    console.log("");

    const passed = reconstructionLooksStructurallyConsistent(flow);
    console.log(`STRUCTURE RESULT: ${passed ? "PASS" : "FAIL"}`);
    if (!passed) {
      printPasteError(
        `File: ${result.file}\nPage: ${page.page}\nOrientation: ${flow.orientation}\nMetrics: ${JSON.stringify(flow.metrics)}\nSTRUCTURE RESULT: FAIL`,
      );
      process.exitCode = 1;
    }
  } catch (error) {
    printPasteError(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  }
}

await main();
