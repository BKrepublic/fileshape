import type { PdfJsResourceConfig } from "../src/pdf-inspection-model.js";

function sameOriginDirectory(relative: string, applicationBase: URL): string {
  const url = new URL(relative, applicationBase);
  if (url.origin !== location.origin) throw new Error(`PDF.js resource escaped application origin: ${relative}`);
  return url.href.endsWith("/") ? url.href : `${url.href}/`;
}

export function browserPdfJsResourceConfig(applicationBase: URL): PdfJsResourceConfig {
  if (applicationBase.origin !== location.origin) throw new Error("PDF.js application base escaped the application origin");
  return {
    cMapUrl: sameOriginDirectory("pdfjs/cmaps/", applicationBase),
    cMapPacked: true,
    standardFontDataUrl: sameOriginDirectory("pdfjs/standard_fonts/", applicationBase),
    wasmUrl: sameOriginDirectory("pdfjs/wasm/", applicationBase),
    iccUrl: sameOriginDirectory("pdfjs/iccs/", applicationBase),
    useWasm: true,
    useWorkerFetch: true,
    useSystemFonts: false,
    disableFontFace: true,
    // PDF.js defaults these to true in browsers but false in Node. Keeping
    // them false makes PDF.js expose decoded pixel data rather than browser-
    // specific bitmap objects, preserving the accepted Node image semantics.
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
  };
}
