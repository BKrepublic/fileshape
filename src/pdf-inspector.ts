import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { itemDisplayGeometry, type TextGeometry } from "./display-geometry.js";
import { fullTextRef, type SourceTextRef } from "./source-text.js";
import { bindGlyphSources, extractOperatorGlyphs, type ExtractedGlyph } from "./pdfjs-glyph-adapter.js";
import type { SourceOutlineItem } from "./document-navigation.js";
import { readPdfOutline } from "./pdf-outline.js";
import {
  extractProductionPageImages,
  validateProductionImageLimits,
  type InspectedImageOccurrence,
  type InspectedImageResource,
} from "./pdf-production-images.js";

export type InspectTextItem = {
  text: string;
  dir: string;
  fontName: string;
  width: number;
  height: number;
  transform: number[];
  x: number;
  y: number;
  displayTransform: number[];
  displayX: number;
  displayY: number;
  fontSize: number;
  hasEOL: boolean;
  source?: SourceTextRef;
  displayGeometry?: TextGeometry;
  glyphs?: ExtractedGlyph[];
  glyphMapping?: "exact" | "unmapped" | "ambiguous";
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
  glyphIssues?: string[];
  /** Includes unmapped operator glyphs; never discard source Unicode on mismatch. */
  operatorGlyphs?: ExtractedGlyph[];
  /** Present only when production image extraction was explicitly requested. */
  imageOccurrences?: InspectedImageOccurrence[];
};

export type InspectResult = {
  file: string;
  byteLength: number;
  pageCount: number;
  pages: InspectPage[];
  outline?: SourceOutlineItem[];
  /** PNG content resources deduplicated across the complete source document. */
  imageResources?: InspectedImageResource[];
};

export type PdfInspectionOptions = {
  includeGlyphs?: boolean;
  includeImages?: boolean;
};

export type PdfJsResourceConfig = {
  cMapUrl: string;
  cMapPacked: boolean;
  standardFontDataUrl: string;
  useSystemFonts: boolean;
  disableFontFace: boolean;
};

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

function validateSourceName(sourceName: string): void {
  if (sourceName.length === 0) throw new Error("sourceName must not be empty");
  if (/[\\/\0]/.test(sourceName)) {
    throw new Error("sourceName must not contain path separators or NUL");
  }
}

function estimateFontSize(transform: number[]): number {
  const [a = 0, b = 0, c = 0, d = 0] = transform;
  const xScale = Math.hypot(a, b);
  const yScale = Math.hypot(c, d);
  return Math.max(xScale, yScale);
}

function multiplyTransforms(left: number[], right: number[]): number[] {
  const [a1 = 1, b1 = 0, c1 = 0, d1 = 1, e1 = 0, f1 = 0] = left;
  const [a2 = 1, b2 = 0, c2 = 0, d2 = 1, e2 = 0, f2 = 0] = right;

  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
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

export async function inspectPdfBytes(
  sourceBytes: Uint8Array,
  sourceName: string,
  options: PdfInspectionOptions,
  resources: PdfJsResourceConfig,
): Promise<InspectResult> {
  validateSourceName(sourceName);
  if (sourceBytes.byteLength === 0) throw new Error("PDF input must not be empty");
  const byteLength = sourceBytes.byteLength;
  // PDF.js may detach the supplied buffer while loading. Keep ownership of the
  // caller's bytes at this boundary and hand PDF.js an independent copy.
  const data = new Uint8Array(sourceBytes);

  const loadingTask = getDocument({
    data,
    ...resources,
  });

  try {
    const pdf = await loadingTask.promise;
    const pageCount = pdf.numPages;
    const outline = await readPdfOutline(pdf);
    const pages: InspectPage[] = [];
    const imageResources = new Map<string, InspectedImageResource>();

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

        const transform = [...item.transform];
        const displayTransform = multiplyTransforms([...viewport.transform], transform);

        textItems.push({
          source: fullTextRef(pageNumber, textItems.length, item.str),
          displayGeometry: itemDisplayGeometry(transform, [...viewport.transform], item.width, item.height,
            textContent.styles[item.fontName]?.vertical === true),
          text: item.str,
          dir: item.dir,
          fontName: item.fontName,
          width: item.width,
          height: item.height,
          transform,
          x: transform[4] ?? 0,
          y: transform[5] ?? 0,
          displayTransform,
          displayX: displayTransform[4] ?? 0,
          displayY: displayTransform[5] ?? 0,
          fontSize: estimateFontSize(transform),
          hasEOL: item.hasEOL,
        });
      }

      const extracted = options.includeGlyphs
        ? extractOperatorGlyphs(pageNumber, operatorList, [...viewport.transform], (id) => page.commonObjs.get(id))
        : undefined;
      if (extracted) bindGlyphSources(textItems, extracted.glyphs, pageNumber);
      const productionImages = options.includeImages
        ? extractProductionPageImages(
          pageNumber,
          { fnArray: operatorList.fnArray, argsArray: operatorList.argsArray },
          [...viewport.transform],
          (page as unknown as { objs: { get(id: string): unknown } }).objs,
        )
        : undefined;
      for (const resource of productionImages?.resources ?? []) {
        const existing = imageResources.get(resource.id);
        if (existing && (existing.width !== resource.width || existing.height !== resource.height ||
            existing.pixelKind !== resource.pixelKind || existing.decodedByteLength !== resource.decodedByteLength ||
            existing.mediaType !== resource.mediaType || existing.contentHash !== resource.contentHash)) {
          throw new Error(`conflicting image resource identity ${resource.id}`);
        }
        imageResources.set(resource.id, existing ?? resource);
      }

      pages.push({
        ...(extracted ? { operatorGlyphs: extracted.glyphs, glyphIssues: extracted.issues } : {}),
        page: pageNumber,
        width: viewport.width,
        height: viewport.height,
        rotation: viewport.rotation,
        userUnit: page.userUnit,
        view: [...page.view],
        textItemCount: textItems.length,
        imagePaintOps: countImagePaintOps(operatorList.fnArray),
        textItems,
        ...(productionImages === undefined ? {} : { imageOccurrences: productionImages.occurrences }),
      });
    }

    if (options.includeImages) {
      validateProductionImageLimits(
        [...imageResources.values()],
        pages.flatMap((page) => page.imageOccurrences ?? []),
      );
    }
    return {
      file: sourceName,
      byteLength,
      pageCount,
      pages,
      outline,
      ...(options.includeImages ? { imageResources: [...imageResources.values()] } : {}),
    };
  } finally {
    await loadingTask.destroy();
  }
}

export async function inspectPdf(
  inputPath: string,
  options: PdfInspectionOptions = {},
): Promise<InspectResult> {
  const data = new Uint8Array(await readFile(inputPath));
  return inspectPdfBytes(data, path.basename(inputPath), options, nodePdfJsResourceConfig);
}
