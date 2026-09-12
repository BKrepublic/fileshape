import * as pdfjsLib from "pdfjs-dist/build/pdf.mjs";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

export type PdfJsProbeResult = {
  state: "supported" | "unsupported";
  message: string;
  pageCount?: number;
  text?: string;
  realWorkerPort: boolean;
};

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

export async function probePdfJsRuntime(): Promise<PdfJsProbeResult> {
  const workerLocation = new URL(workerUrl, location.href);
  if (workerLocation.origin !== location.origin) {
    return unsupported("PDF.js worker must be served by the current origin.");
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc = workerLocation.href;
  let worker: pdfjsLib.PDFWorker | undefined;
  let loadingTask: pdfjsLib.PDFDocumentLoadingTask | undefined;
  let document: pdfjsLib.PDFDocumentProxy | undefined;
  try {
    worker = new pdfjsLib.PDFWorker({ name: "fileshape-probe" });
    await worker.promise;
    if (!(worker.port instanceof Worker)) return unsupported("PDF.js did not create a real module worker.");

    const data = fixturePdf().slice();
    loadingTask = pdfjsLib.getDocument({ data, worker, useSystemFonts: false, disableFontFace: true });
    document = await loadingTask.promise;
    if (document.numPages !== 1) return unsupported("PDF.js fixture page count was unexpected.", true);
    const page = await document.getPage(1);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: { str?: string }) => item.str ?? "")
      .join("")
      .trim();
    if (text !== "FileShape browser probe") return unsupported("PDF.js fixture text was unexpected.", true);
    return { state: "supported", message: "PDF.js の実ワーカーと1ページfixtureを確認しました。", pageCount: 1, text, realWorkerPort: true };
  } catch {
    return unsupported("PDF.js のブラウザ実行環境を確認できませんでした。");
  } finally {
    // Tear down through exactly one owning PDF.js layer. Calling loadingTask,
    // document and worker destruction back-to-back can race the same worker
    // shutdown and leave the probe promise pending in a real browser.
    if (document) {
      await document.destroy().catch(() => undefined);
    } else if (loadingTask) {
      await loadingTask.destroy().catch(() => undefined);
    } else {
      worker?.destroy();
    }
  }
}
