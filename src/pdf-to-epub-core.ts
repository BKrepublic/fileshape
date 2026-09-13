import { assertSha256Hex, type BinaryRuntime } from "./binary-runtime.js";
import type { UnresolvedRubyPolicy } from "./content-policy.js";
import {
  resolveCoverImageResourceId,
  type CoverOccurrenceSelector,
} from "./cover-policy.js";
import {
  serializeEpubPackage,
  type EpubPackageOptions,
  type EpubPageProgressionDirection,
} from "./epub-package.js";
import { inferStructuralHeadings } from "./heading-inference.js";
import { buildDocumentFromInspection } from "./pdf-document-pipeline.js";
import { inspectPdfBytes } from "./pdf-inspector-core.js";
import { associateRubySpans, type RubySpan } from "./ruby-spans.js";
import { reconstructPageFlow } from "./text-flow.js";
import type { EpubNavigationSummary } from "./epub-navigation.js";
import type { EpubRubyMode } from "./epub-xhtml.js";
import type { PdfJsResourceConfig } from "./pdf-inspection-model.js";

export type PdfToEpubOptions = Omit<
  EpubPackageOptions,
  "title" | "identifier" | "coverImageResourceId" | "structuralHeadings"
> & {
  title?: string;
  identifier?: string;
  /** Exact source occurrence selected as cover. Omitted means no cover designation. */
  coverOccurrence?: CoverOccurrenceSelector;
};

export type PdfBytesToEpubResult = {
  sourceName: string;
  bytes: Uint8Array;
  documentId: string;
  pageCount: number;
  unresolvedAnnotationCount: number;
  byteLength: number;
  navigation: EpubNavigationSummary;
  coverImageResourceId?: string;
};

export type PdfConversionProgressPhase =
  | "loading-pdf"
  | "inspecting-pages"
  | "building-document"
  | "serializing-epub";

export type PdfConversionProgress = {
  phase: PdfConversionProgressPhase;
  completedUnits: number;
  totalUnits?: number;
};

export type PdfConversionControl = {
  /** Progress is monotonic across the complete conversion, not reset per phase. */
  onProgress?: (progress: PdfConversionProgress) => void;
  /** Throw to abort at the next source-safe boundary. */
  throwIfCancelled?: () => void;
};

function defaultTitle(sourceName: string): string {
  const lastDot = sourceName.lastIndexOf(".");
  return lastDot > 0 ? sourceName.slice(0, lastDot) : sourceName;
}

async function sourceId(bytes: Uint8Array, runtime: BinaryRuntime): Promise<string> {
  return `urn:sha256:${assertSha256Hex(await runtime.sha256Hex(bytes))}`;
}

function validateSourceInput(sourceBytes: Uint8Array, sourceName: string): void {
  if (sourceName.length === 0) throw new Error("sourceName must not be empty");
  if (/[\\/\0]/.test(sourceName)) {
    throw new Error("sourceName must not contain path separators or NUL");
  }
  if (sourceBytes.byteLength === 0) throw new Error("PDF input must not be empty");
}

export async function convertPdfBytesToEpubWithResources(
  sourceBytes: Uint8Array,
  sourceName: string,
  options: PdfToEpubOptions | undefined,
  resources: PdfJsResourceConfig,
  binaryRuntime: BinaryRuntime,
  control?: PdfConversionControl,
): Promise<PdfBytesToEpubResult> {
  validateSourceInput(sourceBytes, sourceName);
  control?.throwIfCancelled?.();
  const effectiveOptions = options ?? {};
  control?.onProgress?.({ phase: "loading-pdf", completedUnits: 0 });
  const documentId = await sourceId(sourceBytes, binaryRuntime);
  control?.throwIfCancelled?.();

  let totalUnits: number | undefined;
  const precomputedRubySpans = new Map<number, RubySpan[]>();

  const inspection = await inspectPdfBytes(
    sourceBytes,
    sourceName,
    { includeGlyphs: true, includeImages: true },
    resources,
    binaryRuntime,
    {
      ...(control?.throwIfCancelled === undefined ? {} : { throwIfCancelled: control.throwIfCancelled }),
      onDocumentLoaded: (pageCount) => {
        totalUnits = pageCount + 3;
        control?.onProgress?.({ phase: "loading-pdf", completedUnits: 1, totalUnits });
        control?.onProgress?.({ phase: "inspecting-pages", completedUnits: 1, totalUnits });
      },
      onPageInspected: (completedPages, _totalPages, page) => {
        // Ruby association needs glyph geometry only while this page is live.
        // Keep the compact source-backed result and drop the heavy glyph
        // evidence before inspection advances to the next page.
        const flow = reconstructPageFlow(page);

        precomputedRubySpans.set(
          page.page,
          associateRubySpans(page, flow.bodyFontSize),
        );

        delete page.operatorGlyphs;
        delete page.glyphIssues;

        // The original PDF transform and ruby-only display geometry are no
        // longer needed after flow/ruby extraction. Later layout reconstruction
        // uses displayX/displayY/width/height/fontSize and displayTransform.
        // Share one empty vector instead of retaining a six-number array for
        // every text item in the document.
        const releasedTransform: number[] = [];

        for (const item of page.textItems) {
          delete item.glyphs;
          delete item.glyphMapping;
          delete item.displayGeometry;
          item.transform = releasedTransform;
        }

        if (totalUnits === undefined) {
          throw new Error("conversion progress total is unavailable after PDF load");
        }

        control?.onProgress?.({
          phase: "inspecting-pages",
          completedUnits: 1 + completedPages,
          totalUnits,
        });
      },
    },
  );
  control?.throwIfCancelled?.();
  if (totalUnits === undefined) totalUnits = inspection.pageCount + 3;

  control?.onProgress?.({
    phase: "building-document",
    completedUnits: 1 + inspection.pageCount,
    totalUnits,
  });
  const { document } = buildDocumentFromInspection(
    inspection,
    documentId,
    precomputedRubySpans,
  );
  const structuralHeadings = inspection.outline && inspection.outline.length > 0
    ? []
    : inferStructuralHeadings(document, inspection);
  control?.throwIfCancelled?.();
  control?.onProgress?.({
    phase: "building-document",
    completedUnits: 2 + inspection.pageCount,
    totalUnits,
  });
  const unresolvedAnnotationCount = document.pages.reduce(
    (count, page) => count + page.unresolvedRuby.length,
    0,
  );
  const effectiveUnresolvedPolicy: UnresolvedRubyPolicy = effectiveOptions.unresolvedRubyPolicy
    ?? "preserve-as-page-note";
  const coverImageResourceId = effectiveOptions.coverOccurrence === undefined
    ? undefined
    : resolveCoverImageResourceId(document, effectiveOptions.coverOccurrence);

  control?.throwIfCancelled?.();
  control?.onProgress?.({
    phase: "serializing-epub",
    completedUnits: 2 + inspection.pageCount,
    totalUnits,
  });
  const epub = serializeEpubPackage(document, {
    title: effectiveOptions.title ?? defaultTitle(sourceName),
    identifier: effectiveOptions.identifier ?? documentId,
    ...(effectiveOptions.creator === undefined ? {} : { creator: effectiveOptions.creator }),
    ...(effectiveOptions.language === undefined ? {} : { language: effectiveOptions.language }),
    ...(effectiveOptions.modified === undefined ? {} : { modified: effectiveOptions.modified }),
    ...(effectiveOptions.titlePrefix === undefined ? {} : { titlePrefix: effectiveOptions.titlePrefix }),
    ...(effectiveOptions.rubyMode === undefined ? {} : { rubyMode: effectiveOptions.rubyMode as EpubRubyMode }),
    ...(effectiveOptions.pageProgressionDirection === undefined
      ? {}
      : { pageProgressionDirection: effectiveOptions.pageProgressionDirection as EpubPageProgressionDirection }),
    ...(coverImageResourceId === undefined ? {} : { coverImageResourceId }),
    ...(structuralHeadings.length === 0 ? {} : { structuralHeadings }),
    unresolvedRubyPolicy: effectiveUnresolvedPolicy,
  });
  control?.throwIfCancelled?.();
  control?.onProgress?.({
    phase: "serializing-epub",
    completedUnits: 3 + inspection.pageCount,
    totalUnits,
  });

  const outputBytes = new Uint8Array(epub.bytes);
  return {
    sourceName,
    bytes: outputBytes,
    documentId,
    pageCount: document.pages.length,
    unresolvedAnnotationCount,
    byteLength: outputBytes.byteLength,
    navigation: epub.navigation,
    ...(coverImageResourceId === undefined ? {} : { coverImageResourceId }),
  };
}
