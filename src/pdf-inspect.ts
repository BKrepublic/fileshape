import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { getDocument, OPS, type TextItem, type TextMarkedContent } from "pdfjs-dist/legacy/build/pdf.mjs";

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

function isTextItem(item: TextItem | TextMarkedContent): item is TextItem {
  return "str" in item;
}

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

async function inspectPdf(inputPath: string) {
  const data = new Uint8Array(await readFile(inputPath));
  const loadingTask = getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
  });
  const pdf = await loadingTask.promise;

  const pages: InspectPage[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent({
      includeMarkedContent: true,
      disableNormalization: false,
    });
    const operatorList = await page.getOperatorList();

    const textItems: InspectTextItem[] = textContent.items
      .filter(isTextItem)
      .map((item) => ({
        text: item.str,
        dir: item.dir,
        fontName: item.fontName,
        width: item.width,
        height: item.height,
        transform: [...item.transform],
        x: item.transform[4] ?? 0,
        y: item.transform[5] ?? 0,
        fontSize: estimateFontSize(item.transform),
        hasEOL: item.hasEOL,
      }));

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
    byteLength: data.byteLength,
    pageCount: pdf.numPages,
    pages,
  };
}

async function main() {
  const inputPath = process.argv[2];

  if (!inputPath) {
    console.error("Usage: npm run inspect:pdf -- <path-to-pdf>");
    process.exitCode = 1;
    return;
  }

  try {
    const result = await inspectPdf(inputPath);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  }
}

await main();
