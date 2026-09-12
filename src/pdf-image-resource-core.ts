import { version } from "pdfjs-dist/legacy/build/pdf.mjs";
import { assertSha256Hex, type BinaryRuntime } from "./binary-runtime.js";

const PINNED_PDFJS_VERSION = "6.3.289";
const IMAGE_KIND_GRAYSCALE_1BPP = 1;
const IMAGE_KIND_RGB_24BPP = 2;
const IMAGE_KIND_RGBA_32BPP = 3;

export type PdfImagePixelKind = "gray1" | "rgb24" | "rgba32";

export type ExtractedPdfImageResource = {
  sourceResourceId: string;
  width: number;
  height: number;
  pixelKind: PdfImagePixelKind;
  interpolate: boolean;
  decodedByteLength: number;
  contentHash: string;
  mediaType: "image/png";
  extension: "png";
  bytes: Uint8Array;
};

export type PdfImageResourceFailure = {
  sourceResourceId: string;
  status: "unsupported";
  reason: string;
};

export type PdfImageResourceResult = ExtractedPdfImageResource | PdfImageResourceFailure;

type PdfJsImageObject = {
  width?: unknown;
  height?: unknown;
  kind?: unknown;
  data?: unknown;
  bitmap?: unknown;
  interpolate?: unknown;
};

type PdfObjects = {
  get(id: string): unknown;
};

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

function byteView(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return undefined;
}

function expectedLength(kind: number, width: number, height: number): number | undefined {
  switch (kind) {
    case IMAGE_KIND_GRAYSCALE_1BPP:
      return Math.ceil(width / 8) * height;
    case IMAGE_KIND_RGB_24BPP:
      return width * height * 3;
    case IMAGE_KIND_RGBA_32BPP:
      return width * height * 4;
    default:
      return undefined;
  }
}

function pixelKind(kind: number): PdfImagePixelKind | undefined {
  switch (kind) {
    case IMAGE_KIND_GRAYSCALE_1BPP: return "gray1";
    case IMAGE_KIND_RGB_24BPP: return "rgb24";
    case IMAGE_KIND_RGBA_32BPP: return "rgba32";
    default: return undefined;
  }
}

function u32be(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value >>> 0, false);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) === 0 ? 0 : 0xedb88320);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const body = concat([typeBytes, data]);
  return concat([u32be(data.byteLength), body, u32be(crc32(body))]);
}

async function pngBytes(
  runtime: BinaryRuntime,
  kind: PdfImagePixelKind,
  width: number,
  height: number,
  source: Uint8Array,
): Promise<Uint8Array> {
  const bytesPerRow = kind === "gray1" ? Math.ceil(width / 8) : width * (kind === "rgb24" ? 3 : 4);
  const raw = new Uint8Array(height * (bytesPerRow + 1));
  for (let row = 0; row < height; row += 1) {
    const sourceStart = row * bytesPerRow;
    const outputStart = row * (bytesPerRow + 1);
    raw[outputStart] = 0;
    raw.set(source.subarray(sourceStart, sourceStart + bytesPerRow), outputStart + 1);
  }

  const colorType = kind === "gray1" ? 0 : kind === "rgb24" ? 2 : 6;
  const bitDepth = kind === "gray1" ? 1 : 8;
  const ihdr = concat([
    u32be(width),
    u32be(height),
    Uint8Array.from([bitDepth, colorType, 0, 0, 0]),
  ]);
  const compressed = Uint8Array.from(await runtime.deflateZlib(raw));
  return concat([
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", new Uint8Array()),
  ]);
}

export async function extractPdfImageResourceWithRuntime(
  sourceResourceId: string,
  value: unknown,
  runtime: BinaryRuntime,
): Promise<PdfImageResourceResult> {
  if (version !== PINNED_PDFJS_VERSION) {
    return { sourceResourceId, status: "unsupported", reason: `unsupported-pdfjs-version:${version}` };
  }
  if (typeof value !== "object" || value === null) {
    return { sourceResourceId, status: "unsupported", reason: "image-object-not-object" };
  }
  const image = value as PdfJsImageObject;
  if (!isPositiveInteger(image.width) || !isPositiveInteger(image.height)) {
    return { sourceResourceId, status: "unsupported", reason: "invalid-image-dimensions" };
  }
  if (typeof image.kind !== "number") {
    return { sourceResourceId, status: "unsupported", reason: "missing-image-kind" };
  }
  const format = pixelKind(image.kind);
  if (!format) {
    return { sourceResourceId, status: "unsupported", reason: `unsupported-image-kind:${image.kind}` };
  }
  const data = byteView(image.data);
  if (!data) {
    return {
      sourceResourceId,
      status: "unsupported",
      reason: image.bitmap === undefined ? "missing-decoded-image-data" : "bitmap-only-image-object",
    };
  }
  const length = expectedLength(image.kind, image.width, image.height);
  if (length === undefined || data.byteLength !== length) {
    return {
      sourceResourceId,
      status: "unsupported",
      reason: `decoded-length-mismatch:${data.byteLength}:${length ?? "unknown"}`,
    };
  }

  const copied = Uint8Array.from(data);
  const bytes = await pngBytes(runtime, format, image.width, image.height, copied);
  const contentHash = assertSha256Hex(await runtime.sha256Hex(bytes));
  return {
    sourceResourceId,
    width: image.width,
    height: image.height,
    pixelKind: format,
    interpolate: image.interpolate === true,
    decodedByteLength: copied.byteLength,
    contentHash,
    mediaType: "image/png",
    extension: "png",
    bytes,
  };
}

export async function resolvePdfImageResourceWithRuntime(
  store: PdfObjects,
  sourceResourceId: string,
  runtime: BinaryRuntime,
): Promise<PdfImageResourceResult> {
  try {
    return await extractPdfImageResourceWithRuntime(sourceResourceId, store.get(sourceResourceId), runtime);
  } catch (error) {
    return {
      sourceResourceId,
      status: "unsupported",
      reason: `unresolved-image-object:${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
