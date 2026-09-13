import { nodeBinaryRuntime } from "./binary-runtime-node.js";
import {
  extractPdfImageResourceWithRuntime,
  resolvePdfImageResourceWithRuntime,
  type PdfImageResourceResult,
} from "./pdf-image-resource-core.js";

export type {
  ExtractedPdfImageResource,
  PdfImagePixelKind,
  PdfImageResourceFailure,
  PdfImageResourceResult,
} from "./pdf-image-resource-core.js";

type PdfObjects = {
  get(id: string): unknown;
};

/** Node adapter preserving the accepted zlib/SHA-256 byte contract. */
export async function extractPdfImageResource(
  sourceResourceId: string,
  value: unknown,
): Promise<PdfImageResourceResult> {
  return extractPdfImageResourceWithRuntime(sourceResourceId, value, nodeBinaryRuntime);
}

/** Node adapter preserving the accepted PDF.js image-object lookup contract. */
export async function resolvePdfImageResource(
  store: PdfObjects,
  sourceResourceId: string,
): Promise<PdfImageResourceResult> {
  return resolvePdfImageResourceWithRuntime(store, sourceResourceId, nodeBinaryRuntime);
}
