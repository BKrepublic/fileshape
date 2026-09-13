import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nodeBinaryRuntime } from "./binary-runtime-node.js";
import { inspectPdfBytes as inspectPdfBytesCore } from "./pdf-inspector-core.js";
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

/** Node byte adapter preserving the accepted Stage 26 public signature. */
export async function inspectPdfBytes(
  sourceBytes: Uint8Array,
  sourceName: string,
  options: PdfInspectionOptions,
  resources: PdfJsResourceConfig,
): Promise<InspectResult> {
  return inspectPdfBytesCore(sourceBytes, sourceName, options, resources, nodeBinaryRuntime);
}

export async function inspectPdf(
  inputPath: string,
  options: PdfInspectionOptions = {},
): Promise<InspectResult> {
  const data = new Uint8Array(await readFile(inputPath));
  return inspectPdfBytes(data, path.basename(inputPath), options, nodePdfJsResourceConfig);
}
