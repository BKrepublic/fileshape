import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectPdfBytes } from "./pdf-inspector-core.js";
import type {
  InspectPage,
  InspectResult,
  InspectTextItem,
  PdfInspectionOptions,
  PdfJsResourceConfig,
} from "./pdf-inspection-model.js";

export type {
  InspectPage,
  InspectResult,
  InspectTextItem,
  PdfInspectionOptions,
  PdfJsResourceConfig,
} from "./pdf-inspection-model.js";
export { inspectPdfBytes } from "./pdf-inspector-core.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const pdfJsRoot = path.resolve(moduleDir, "../node_modules/pdfjs-dist");

function directoryPath(...parts: string[]): string {
  return `${path.join(...parts)}${path.sep}`;
}

const cMapUrl = directoryPath(pdfJsRoot, "cmaps");
const standardFontDataUrl = directoryPath(pdfJsRoot, "standard_fonts");

export const nodePdfJsResourceConfig: PdfJsResourceConfig = {
  cMapUrl,
  cMapPacked: true,
  standardFontDataUrl,
  useSystemFonts: true,
  disableFontFace: true,
};

export async function inspectPdf(
  inputPath: string,
  options: PdfInspectionOptions = {},
): Promise<InspectResult> {
  const data = new Uint8Array(await readFile(inputPath));
  return inspectPdfBytes(data, path.basename(inputPath), options, nodePdfJsResourceConfig);
}
