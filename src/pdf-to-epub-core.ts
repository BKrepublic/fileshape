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
import { buildDocumentFromInspection } from "./pdf-document-pipeline.js";
import { inspectPdfBytes } from "./pdf-inspector-core.js";
import type { EpubNavigationSummary } from "./epub-navigation.js";
import type { EpubRubyMode } from "./epub-xhtml.js";
import type { PdfJsResourceConfig } from "./pdf-inspection-model.js";

export type PdfToEpubOptions = Omit<EpubPackageOptions, "title" | "identifier" | "coverImageResourceId"> & {
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
): Promise<PdfBytesToEpubResult> {
  validateSourceInput(sourceBytes, sourceName);
  const effectiveOptions = options ?? {};
  const documentId = await sourceId(sourceBytes, binaryRuntime);
  const inspection = await inspectPdfBytes(
    sourceBytes,
    sourceName,
    { includeGlyphs: true, includeImages: true },
    resources,
    binaryRuntime,
  );
  const { document } = buildDocumentFromInspection(inspection, documentId);
  const unresolvedAnnotationCount = document.pages.reduce(
    (count, page) => count + page.unresolvedRuby.length,
    0,
  );
  const effectiveUnresolvedPolicy: UnresolvedRubyPolicy = effectiveOptions.unresolvedRubyPolicy
    ?? "preserve-as-page-note";
  const coverImageResourceId = effectiveOptions.coverOccurrence === undefined
    ? undefined
    : resolveCoverImageResourceId(document, effectiveOptions.coverOccurrence);

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
    unresolvedRubyPolicy: effectiveUnresolvedPolicy,
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
