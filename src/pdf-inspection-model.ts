import type { TextGeometry } from "./display-geometry.js";
import type { SourceOutlineItem } from "./document-navigation.js";
import type { ExtractedGlyph } from "./pdfjs-glyph-adapter.js";
import type {
  InspectedImageOccurrence,
  InspectedImageResource,
} from "./pdf-production-images.js";
import type { SourceTextRef } from "./source-text.js";

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
  /** Browser conversion resources; omitted by the accepted Node adapter unless needed. */
  wasmUrl?: string;
  iccUrl?: string;
  useWasm?: boolean;
  useWorkerFetch?: boolean;
  /** Keep browser image object representation aligned with Node when byte parity is required. */
  isOffscreenCanvasSupported?: boolean;
  isImageDecoderSupported?: boolean;
};
