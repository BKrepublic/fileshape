import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { BinaryRuntime } from "./binary-runtime.js";
import { itemDisplayGeometry } from "./display-geometry.js";
import { fullTextRef } from "./source-text.js";
import { bindGlyphSources, extractOperatorGlyphs } from "./pdfjs-glyph-adapter.js";
import { readPdfOutline } from "./pdf-outline.js";
import {
  extractProductionPageImages,
  validateProductionImageLimits,
  type InspectedImageResource,
} from "./pdf-production-images.js";
import type {
  InspectPage,
  InspectResult,
  InspectTextItem,
  PdfInspectionOptions,
  PdfJsResourceConfig,
} from "./pdf-inspection-model.js";

export type PdfInspectionControl = {
  /** Throw to abort at the next source-safe async boundary. */
  throwIfCancelled?: () => void;
  /** Called only after PDF.js has loaded a real document and page count is known. */
  onDocumentLoaded?: (pageCount: number) => void;
  /** Called after a complete page has been inspected and committed to the result.
   * The callback may compact evidence that has already been reduced to a
   * source-backed representation. */
  onPageInspected?: (
    completedPages: number,
    totalPages: number,
    page: InspectPage,
  ) => void;
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
  binaryRuntime: BinaryRuntime,
  control?: PdfInspectionControl,
): Promise<InspectResult> {
  validateSourceName(sourceName);
  if (sourceBytes.byteLength === 0) throw new Error("PDF input must not be empty");
  control?.throwIfCancelled?.();
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
    control?.throwIfCancelled?.();
    const pageCount = pdf.numPages;
    control?.onDocumentLoaded?.(pageCount);
    const outline = await readPdfOutline(pdf);
    control?.throwIfCancelled?.();
    const pages: InspectPage[] = [];
    const imageResources = new Map<string, InspectedImageResource>();

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      control?.throwIfCancelled?.();
      const page = await pdf.getPage(pageNumber);
      try {
      control?.throwIfCancelled?.();
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent({
        includeMarkedContent: true,
        disableNormalization: false,
      });
      control?.throwIfCancelled?.();
      const operatorList = await page.getOperatorList();
      control?.throwIfCancelled?.();
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
        ? await extractProductionPageImages(
          pageNumber,
          { fnArray: operatorList.fnArray, argsArray: operatorList.argsArray },
          [...viewport.transform],
          (page as unknown as { objs: { get(id: string): unknown } }).objs,
          binaryRuntime,
        )
        : undefined;
      control?.throwIfCancelled?.();
      for (const resource of productionImages?.resources ?? []) {
        const existing = imageResources.get(resource.id);
        if (existing && (existing.width !== resource.width || existing.height !== resource.height ||
            existing.pixelKind !== resource.pixelKind || existing.decodedByteLength !== resource.decodedByteLength ||
            existing.mediaType !== resource.mediaType || existing.contentHash !== resource.contentHash)) {
          throw new Error(`conflicting image resource identity ${resource.id}`);
        }
        imageResources.set(resource.id, existing ?? resource);
      }

      const inspectedPage: InspectPage = {
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
      };
      pages.push(inspectedPage);
      control?.onPageInspected?.(pageNumber, pageCount, inspectedPage);
      } finally {
        // PDF.js retains page-local operator/font/image caches unless the page
        // proxy is explicitly cleaned. The extracted FileShape evidence above
        // owns independent data by this point, so release PDF.js state before
        // advancing to the next page.
        page.cleanup();
      }
    }

    control?.throwIfCancelled?.();
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
