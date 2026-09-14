import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { inspectPdf } from "./pdf-inspector.js";
import { reconstructPhysicalLayout } from "./physical-layout.js";
import { buildSemanticBlocks } from "./semantic-blocks.js";
import { reconstructPageFlow } from "./text-flow.js";

function compactText(value: string): string {
  return value.replace(/[\s\u3000]+/gu, "");
}

function positiveInteger(value: string | undefined, flag: string): number {
  if (value === undefined) throw new Error(`missing value for ${flag}`);
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${flag} must be a positive integer`);
  return parsed;
}

function preview(value: string, limit = 120): string {
  const compact = compactText(value);
  return compact.length <= limit ? compact : `${compact.slice(0, limit)}…`;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const input = argv.shift();
  if (!input || input.startsWith("--")) {
    throw new Error("usage: npm run diagnose:reading-order -- PDF --page N --needle TEXT");
  }

  let pageNumber: number | undefined;
  let needle: string | undefined;
  while (argv.length > 0) {
    const flag = argv.shift()!;
    const value = argv.shift();
    if (flag === "--page") pageNumber = positiveInteger(value, flag);
    else if (flag === "--needle") needle = value;
    else throw new Error(`unknown option ${flag}`);
  }
  if (pageNumber === undefined) throw new Error("--page N is required");
  if (!needle || compactText(needle).length === 0) throw new Error("--needle TEXT is required");

  const inspection = await inspectPdf(input);
  const page = inspection.pages.find((candidate) => candidate.page === pageNumber);
  if (!page) throw new Error(`page ${pageNumber} does not exist`);

  const flow = reconstructPageFlow(page);
  const physical = reconstructPhysicalLayout(page, flow.orientation, flow.bodyFontSize);
  const semantic = buildSemanticBlocks(physical, flow.bodyFontSize);
  const expected = compactText(needle);
  const sourceEmission = compactText(page.textItems.map((item) => item.text).join(""));
  const flowText = compactText(flow.text);
  const physicalText = compactText(physical.units.map((unit) => unit.text).join(""));
  const semanticText = compactText(semantic.text);

  const stagePresence = {
    sourceEmission: sourceEmission.includes(expected),
    flow: flowText.includes(expected),
    physical: physicalText.includes(expected),
    semantic: semanticText.includes(expected),
  };

  const interestingChars = new Set([...expected]);
  const candidateItems = page.textItems
    .map((item, itemIndex) => ({ item, itemIndex, compact: compactText(item.text) }))
    .filter(({ compact }) => compact.length > 0 && [...compact].some((char) => interestingChars.has(char)))
    .slice(0, 12)
    .map(({ item, itemIndex }) => ({
      itemIndex,
      text: item.text,
      x: Math.round(item.displayX * 100) / 100,
      y: Math.round(item.displayY * 100) / 100,
      width: Math.round(item.width * 100) / 100,
      height: Math.round(item.height * 100) / 100,
      fontSize: Math.round(item.fontSize * 100) / 100,
      yRatio: Math.round((item.displayY / Math.max(1, page.height)) * 10000) / 10000,
    }));

  const unitMatches = physical.units
    .filter((unit) => [...expected].some((char) => compactText(unit.text).includes(char)))
    .slice(0, 12)
    .map((unit) => ({
      index: unit.index,
      position: unit.position,
      text: preview(unit.text, 80),
      itemCount: unit.itemCount,
      inlineStartRatio: unit.inlineStartRatio,
      inlineEndRatio: unit.inlineEndRatio,
      inlineCoverageRatio: unit.inlineCoverageRatio,
    }));

  process.stdout.write([
    `FILE=${path.basename(input)}`,
    `PAGE=${pageNumber}`,
    `NEEDLE=${expected}`,
    `ORIENTATION=${flow.orientation}`,
    `BODY_FONT_SIZE=${flow.bodyFontSize}`,
    `FLOW_METRICS=${JSON.stringify(flow.metrics)}`,
    `COUNTS=textItems:${page.textItems.length},flowPrimary:${flow.primaryItemCount},flowMarginNoise:${flow.marginNoiseItemCount},flowAnnotation:${flow.annotationItemCount},physicalUnits:${physical.units.length},semanticBlocks:${semantic.blocks.length}`,
    `PRESENCE=${JSON.stringify(stagePresence)}`,
    `SOURCE_CANDIDATES=${JSON.stringify(candidateItems)}`,
    `PHYSICAL_UNIT_CANDIDATES=${JSON.stringify(unitMatches)}`,
  ].join("\n") + "\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
