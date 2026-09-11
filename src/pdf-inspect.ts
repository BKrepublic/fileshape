import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

type InspectTextItem = {
  text: string;
  dir: string;
  fontName: string;
  width: number;
  height: number;
  transform: number[];
  x: number;
  y: number;
  fontSize: number;
  hasEOL: boolean;
};

type InspectPage = {
  page: number;
  width: number;
  height: number;
  rotation: number;
  userUnit: number;
  view: number[];
  textItemCount: number;
  imagePaintOps: number;
  textItems: InspectTextItem[];
};

type InspectResult = {
  file: string;
  byteLength: number;
  pageCount: number;
  pages: InspectPage[];
};

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const pdfJsRoot = path.resolve(moduleDir, "../node_modules/pdfjs-dist");

function directoryPath(...parts: string[]): string {
  return `${path.join(...parts)}${path.sep}`;
}

const cMapUrl = directoryPath(pdfJsRoot, "cmaps");
const standardFontDataUrl = directoryPath(pdfJsRoot, "standard_fonts");

function estimateFontSize(transform: number[]): number {
  const [a = 0, b = 0, c = 0, d = 0] = transform;
  const xScale = Math.hypot(a, b);
  const yScale = Math.hypot(c, d);
  return Math.max(xScale, yScale);
}

function countImagePaintOps(fnArray: number[]): number {
  const imageOps = new Set<number>([
    OPS.paintImageXObject,
    OPS.paintImageXObjectRepeat,
    OPS.paintInlineImageXObject,
    OPS.paintInlineImageXObjectGroup,
    OPS.paintSolidColorImageMask,
  ]);

  let count = 0;
  for (const fn of fnArray) {
    if (imageOps.has(fn)) count += 1;
  }
  return count;
}

async function inspectPdf(inputPath: string): Promise<InspectResult> {
  const data = new Uint8Array(await readFile(inputPath));
  const byteLength = data.byteLength;

  const loadingTask = getDocument({
    data,
    cMapUrl,
    cMapPacked: true,
    standardFontDataUrl,
    useSystemFonts: true,
    disableFontFace: true,
  });

  try {
    const pdf = await loadingTask.promise;
    const pageCount = pdf.numPages;
    const pages: InspectPage[] = [];

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent({
        includeMarkedContent: true,
        disableNormalization: false,
      });
      const operatorList = await page.getOperatorList();

      const textItems: InspectTextItem[] = [];

      for (const item of textContent.items) {
        if (!("str" in item)) continue;

        textItems.push({
          text: item.str,
          dir: item.dir,
          fontName: item.fontName,
          width: item.width,
          height: item.height,
          transform: [...item.transform],
          x: item.transform[4] ?? 0,
          y: item.transform[5] ?? 0,
          fontSize: estimateFontSize([...item.transform]),
          hasEOL: item.hasEOL,
        });
      }

      pages.push({
        page: pageNumber,
        width: viewport.width,
        height: viewport.height,
        rotation: viewport.rotation,
        userUnit: page.userUnit,
        view: [...page.view],
        textItemCount: textItems.length,
        imagePaintOps: countImagePaintOps(operatorList.fnArray),
        textItems,
      });
    }

    return {
      file: path.basename(inputPath),
      byteLength,
      pageCount,
      pages,
    };
  } finally {
    await loadingTask.destroy();
  }
}

function printReport(result: InspectResult, outputPath: string): boolean {
  const totalTextItems = result.pages.reduce((sum, page) => sum + page.textItemCount, 0);
  const textPages = result.pages.filter((page) => page.textItemCount > 0).length;
  const checks = [
    {
      label: "PDF file contains data",
      ok: result.byteLength > 0,
      detail: `${result.byteLength.toLocaleString()} bytes`,
    },
    {
      label: "PDF contains pages",
      ok: result.pageCount > 0,
      detail: `${result.pageCount} pages`,
    },
    {
      label: "All pages were inspected",
      ok: result.pages.length === result.pageCount,
      detail: `${result.pages.length}/${result.pageCount} pages`,
    },
    {
      label: "Text was extracted",
      ok: totalTextItems > 0,
      detail: `${totalTextItems.toLocaleString()} text items on ${textPages}/${result.pageCount} pages`,
    },
  ];

  console.log("\n=== FileShape PDF inspection ===");
  console.log(`File: ${result.file}`);
  console.log(`JSON: ${outputPath}`);
  console.log("");

  for (const check of checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"}  ${check.label} (${check.detail})`);
  }

  const passed = checks.every((check) => check.ok);
  console.log("");
  console.log(`RESULT: ${passed ? "PASS" : "FAIL"}`);
  return passed;
}

function parseArguments(args: string[]): { inputPath?: string; outputPath?: string } {
  const inputPath = args[0];
  let outputPath: string | undefined;

  for (let index = 1; index < args.length; index += 1) {
    if (args[index] === "--output") {
      outputPath = args[index + 1];
      index += 1;
    }
  }

  return { inputPath, outputPath };
}

async function main() {
  const { inputPath, outputPath } = parseArguments(process.argv.slice(2));

  if (!inputPath) {
    console.error("Usage: npm run inspect:pdf -- <path-to-pdf> [--output <path-to-json>]");
    process.exitCode = 1;
    return;
  }

  try {
    const result = await inspectPdf(inputPath);

    if (!outputPath) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    const passed = printReport(result, outputPath);
    if (!passed) process.exitCode = 1;
  } catch (error) {
    console.error("\n=== FileShape PDF inspection ===");
    console.error("RESULT: FAIL");
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  }
}

await main();
