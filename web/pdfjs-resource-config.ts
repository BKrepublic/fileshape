import type { PdfJsResourceConfig } from "../src/pdf-inspection-model.js";

function sameOriginDirectory(relative: string): string {
  const appBase = new URL(import.meta.env.BASE_URL, location.href);
  const url = new URL(relative, appBase);
  if (url.origin !== location.origin) throw new Error(`PDF.js resource escaped application origin: ${relative}`);
  return url.href.endsWith("/") ? url.href : `${url.href}/`;
}

export function browserPdfJsResourceConfig(): PdfJsResourceConfig {
  return {
    cMapUrl: sameOriginDirectory("pdfjs/cmaps/"),
    cMapPacked: true,
    standardFontDataUrl: sameOriginDirectory("pdfjs/standard_fonts/"),
    wasmUrl: sameOriginDirectory("pdfjs/wasm/"),
    iccUrl: sameOriginDirectory("pdfjs/iccs/"),
    useWasm: true,
    useWorkerFetch: true,
    useSystemFonts: false,
    disableFontFace: true,
  };
}
