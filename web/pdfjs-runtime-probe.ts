import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import { browserPdfJsResourceConfig } from "./pdfjs-resource-config.js";

export type PdfJsProbeResult = {
  state: "supported" | "unsupported";
  message: string;
  pageCount?: number;
  text?: string;
  realWorkerPort: boolean;
};

class ProbeTimeoutError extends Error {
  constructor(readonly stage: string) {
    super(`PDF.js probe timed out during ${stage}.`);
    this.name = "ProbeTimeoutError";
  }
}

async function within<T>(promise: Promise<T>, stage: string, timeoutMs = 30_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new ProbeTimeoutError(stage)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function settleCleanup(cleanup: () => unknown): Promise<void> {
  await Promise.race([
    Promise.resolve().then(cleanup).then(() => undefined, () => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 1_000)),
  ]);
}

function fixturePdf(): Uint8Array {
  const encoder = new TextEncoder();
  const stream = "BT /F1 14 Tf 72 100 Td (FileShape browser probe) Tj ET";
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n",
    `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];
  const header = "%PDF-1.4\n% FileShape fixture\n";
  let body = header;
  const offsets = [0];
  for (const object of objects) {
    offsets.push(body.length);
    body += object;
  }
  const xrefOffset = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return encoder.encode(body);
}

function unsupported(message: string, realWorkerPort = false): PdfJsProbeResult {
  return { state: "unsupported", message, realWorkerPort };
}

async function requireResource(url: string, label: string): Promise<void> {
  const resource = new URL(url, location.href);
  if (resource.origin !== location.origin) throw new Error(`${label} escaped the application origin`);
  const response = await within(fetch(resource.href), `${label} fetch`);
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
  const bytes = await within(response.arrayBuffer(), `${label} read`);
  if (bytes.byteLength === 0) throw new Error(`${label} is empty`);
}

export async function probePdfJsRuntime(): Promise<PdfJsProbeResult> {
  const workerLocation = new URL(workerUrl, location.href);
  if (workerLocation.origin !== location.origin) {
    return unsupported("PDF.js worker must be served by the current origin.");
  }

  const applicationBase = new URL(import.meta.env.BASE_URL, location.href);
  const resources = browserPdfJsResourceConfig(applicationBase);
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerLocation.href;
  let workerPort: Worker | undefined;
  let loadingTask: pdfjsLib.PDFDocumentLoadingTask | undefined;
  let document: pdfjsLib.PDFDocumentProxy | undefined;
  try {
    await Promise.all([
      requireResource(new URL("Adobe-Japan1-UCS2.bcmap", resources.cMapUrl).href, "PDF.js CMap resource"),
      requireResource(new URL("FoxitSymbol.pfb", resources.standardFontDataUrl).href, "PDF.js standard font resource"),
      requireResource(new URL("qcms_bg.wasm", resources.wasmUrl!).href, "PDF.js WASM resource"),
      requireResource(new URL("CGATS001Compat-v2-micro.icc", resources.iccUrl!).href, "PDF.js ICC resource"),
    ]);

    // Use the same legacy PDF.js browser build and worker used by the real
    // conversion worker. A readiness probe must not reject a browser through a
    // different code path from production conversion.
    workerPort = new Worker(workerLocation, { type: "module", name: "fileshape-pdfjs-probe" });
    pdfjsLib.GlobalWorkerOptions.workerPort = workerPort;
    if (pdfjsLib.GlobalWorkerOptions.workerPort !== workerPort) {
      return unsupported("PDF.js did not retain the explicit real worker port.");
    }

    const data = fixturePdf().slice();
    loadingTask = pdfjsLib.getDocument({ data, ...resources });
    document = await within(loadingTask.promise, "document load");
    if (document.numPages !== 1) return unsupported("PDF.js fixture page count was unexpected.", true);
    const page = await within(document.getPage(1), "page load");
    const content = await within(page.getTextContent(), "text extraction");
    const text = content.items
      .map((item: { str?: string }) => item.str ?? "")
      .join("")
      .trim();
    if (text !== "FileShape browser probe") return unsupported("PDF.js fixture text was unexpected.", true);
    return {
      state: "supported",
      message: "PDF.js 実ワーカーとsame-origin CMap・標準フォント・WASM・ICC資源を確認しました。",
      pageCount: 1,
      text,
      realWorkerPort: true,
    };
  } catch (error) {
    const message = error instanceof ProbeTimeoutError
      ? error.message
      : error instanceof Error ? error.message : "PDF.js のブラウザ実行環境を確認できませんでした。";
    return unsupported(message, workerPort !== undefined);
  } finally {
    if (document) {
      await settleCleanup(() => document?.destroy());
    } else if (loadingTask) {
      await settleCleanup(() => loadingTask?.destroy());
    }
    await settleCleanup(() => {
      if (pdfjsLib.GlobalWorkerOptions.workerPort === workerPort) {
        pdfjsLib.GlobalWorkerOptions.workerPort = null;
      }
      workerPort?.terminate();
    });
  }
}
