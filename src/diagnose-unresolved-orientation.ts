import { readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { resolveDocumentOrientations } from "./document-orientation.js";
import { inspectPdf } from "./pdf-inspector.js";
import { reconstructPhysicalLayout } from "./physical-layout.js";
import { buildSemanticBlocks } from "./semantic-blocks.js";
import { reconstructPageFlow, type WritingOrientation } from "./text-flow.js";

const WIDTH = 88;
const RULE = "=".repeat(WIDTH);
const SAMPLE_DIRECTORY = "local-samples";

type Candidate = {
  orientation: Exclude<WritingOrientation, "unknown">;
  units: number;
  blocks: number;
  characters: number;
  text: string;
};

function hasVisibleText(page: Awaited<ReturnType<typeof inspectPdf>>["pages"][number]): boolean {
  return page.textItems.some((item) => item.text.trim().length > 0);
}

function preview(text: string, limit = 700): string {
  const compact = text.trim();
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, limit)}…`;
}

function candidateFor(
  page: Awaited<ReturnType<typeof inspectPdf>>["pages"][number],
  bodyFontSize: number,
  orientation: Exclude<WritingOrientation, "unknown">,
): Candidate {
  const physical = reconstructPhysicalLayout(page, orientation, bodyFontSize);
  const semantic = buildSemanticBlocks(physical, bodyFontSize);
  return {
    orientation,
    units: physical.units.length,
    blocks: semantic.blocks.length,
    characters: [...semantic.text].length,
    text: semantic.text,
  };
}

async function main(): Promise<void> {
  const pdfFiles = readdirSync(SAMPLE_DIRECTORY)
    .filter((name) => name.toLowerCase().endsWith(".pdf"))
    .sort();

  const reports: string[] = [];

  for (const name of pdfFiles) {
    const inspection = await inspectPdf(path.join(SAMPLE_DIRECTORY, name));
    const textPages = inspection.pages.filter(hasVisibleText);
    const initial = textPages.map((page) => ({ page, flow: reconstructPageFlow(page) }));
    const resolved = resolveDocumentOrientations(
      initial.map(({ page, flow }) => ({ page: page.page, orientation: flow.orientation })),
    );
    const resolvedByPage = new Map(resolved.map((entry) => [entry.page, entry]));

    for (let index = 0; index < initial.length; index += 1) {
      const current = initial[index];
      if (!current) continue;
      const resolution = resolvedByPage.get(current.page.page);
      if ((resolution?.resolved ?? current.flow.orientation) !== "unknown") continue;

      const neighbors: string[] = [];
      for (let offset = -2; offset <= 2; offset += 1) {
        if (offset === 0) continue;
        const entry = initial[index + offset];
        if (!entry) continue;
        const entryResolution = resolvedByPage.get(entry.page.page);
        neighbors.push(
          `p${entry.page.page}: detected=${entry.flow.orientation}, resolved=${entryResolution?.resolved ?? entry.flow.orientation}, source=${entryResolution?.source ?? "n/a"}, items=${entry.page.textItems.length}`,
        );
      }

      const vertical = candidateFor(current.page, current.flow.bodyFontSize, "vertical");
      const horizontal = candidateFor(current.page, current.flow.bodyFontSize, "horizontal");

      reports.push([
        `FILE: ${inspection.file}`,
        `PAGE: ${current.page.page}/${inspection.pages.length}`,
        `PAGE GEOMETRY: ${current.page.width}x${current.page.height}, rotation=${current.page.rotation}, textItems=${current.page.textItems.length}`,
        `BODY FONT SIZE: ${current.flow.bodyFontSize}`,
        `RAW METRICS: ${JSON.stringify(current.flow.metrics)}`,
        "NEIGHBOR ORIENTATION:",
        ...neighbors.map((line) => `  ${line}`),
        "VERTICAL CANDIDATE:",
        `  units=${vertical.units}, blocks=${vertical.blocks}, chars=${vertical.characters}`,
        "  --- preview ---",
        preview(vertical.text)
          .split("\n")
          .map((line) => `  ${line}`)
          .join("\n"),
        "  --- end preview ---",
        "HORIZONTAL CANDIDATE:",
        `  units=${horizontal.units}, blocks=${horizontal.blocks}, chars=${horizontal.characters}`,
        "  --- preview ---",
        preview(horizontal.text)
          .split("\n")
          .map((line) => `  ${line}`)
          .join("\n"),
        "  --- end preview ---",
      ].join("\n"));
    }
  }

  console.log("");
  console.log(RULE);
  if (reports.length === 0) {
    console.log("FILESHAPE ORIENTATION DIAGNOSIS: NO UNRESOLVED PAGES");
    console.log(RULE);
    return;
  }

  console.log("FILESHAPE ORIENTATION DIAGNOSIS: REVIEW REQUIRED");
  console.log(`Unresolved pages: ${reports.length}`);
  console.log("");
  console.log(reports.join(`\n${"-".repeat(WIDTH)}\n`));
  console.log("");
  console.log("この診断枠を最初から最後までそのまま貼ってください。");
  console.log(RULE);
}

await main().catch((error) => {
  console.error("");
  console.error(RULE);
  console.error("!!! FILESHAPE ORIENTATION DIAGNOSIS: ERROR !!!");
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  console.error(RULE);
  process.exit(1);
});
