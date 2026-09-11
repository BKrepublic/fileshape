import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

export type InspectTextItem = {
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

export type InspectPage = {
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

export type InspectResult = {
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

export async function inspectPdf(inputPath: string): Promise<InspectResult> {
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
