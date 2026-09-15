import "./styles.css";
import ConversionWorker from "./conversion-worker.ts?worker";
import { probeBinaryRuntime, type BinaryRuntimeProbeResult } from "./binary-runtime-probe.js";
import { probePdfJsRuntime, type PdfJsProbeResult } from "./pdfjs-runtime-probe.js";
import {
  BrowserConversionEventTracker,
  type BrowserConversionOptions,
  type BrowserStartMessage,
} from "../src/browser-conversion-contract.js";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("FileShape app root is missing");

app.innerHTML = `
  <header class="top-app-bar">
    <div class="brand-mark" aria-hidden="true">F</div>
    <div class="brand-copy"><strong>FileShape</strong><span>PDF to EPUB</span></div>
    <span class="status-chip"><span class="status-dot"></span>端末内で処理</span>
  </header>
  <main class="page-shell">
    <section class="intro" aria-labelledby="page-title">
      <p class="eyebrow">BROWSER / PWA</p>
      <h1 id="page-title">PDFを、ブラウザだけでEPUBに。</h1>
      <p>PDFは外部へ送らず、変換も端末内で行います。</p>
    </section>
    <section class="surface file-surface" aria-labelledby="file-title">
      <div class="section-heading"><div><h2 id="file-title">PDFを選ぶ</h2><p>変換するPDFを1つ選んでください。</p></div><span class="surface-icon" aria-hidden="true">↥</span></div>
      <label class="file-picker" for="pdf-input"><span class="file-picker-title">PDFを選ぶ</span><span class="file-picker-hint">端末から選択</span></label>
      <input id="pdf-input" class="visually-hidden-input" type="file" accept="application/pdf,.pdf" />
      <p id="selected-file" class="selected-file" aria-live="polite">PDFが選択されていません。</p>
      <button id="reset-file" class="text-button" type="button" hidden>選択を解除</button>
    </section>
    <details class="surface advanced-settings">
      <summary>詳細設定 <span>CLIと同じ変換オプション</span></summary>
      <div class="advanced-grid">
        <label>タイトル<input type="text" name="title" placeholder="PDFのファイル名を使用" /></label>
        <label>作成者<input type="text" name="creator" placeholder="任意" /></label>
        <label>言語<input type="text" name="language" value="ja" /></label>
        <label>ルビ<select name="rubyMode"><option value="on">保持</option><option value="off">表示しない</option></select></label>
        <label>更新日時<input type="text" name="modified" placeholder="YYYY-MM-DDTHH:MM:SSZ（任意）" /></label>
      </div>
      <p class="supporting-text">未指定項目はCLIと同じ既定値を使います。</p>
    </details>
    <section class="surface runtime-surface" aria-labelledby="runtime-title">
      <div class="section-heading"><div><h2 id="runtime-title">動作環境</h2><p>このブラウザで変換できるか確認します。</p></div><span id="runtime-badge" class="state-badge" data-state="checking">確認中</span></div>
      <p id="runtime-message" class="runtime-message" aria-live="polite">変換に必要な機能を確認しています。</p>
      <div hidden aria-hidden="true">
        <span id="pdfjs-status">確認中…</span>
        <span id="binary-runtime-status">確認中…</span>
        <span id="pwa-status">確認中…</span>
      </div>
    </section>
    <section class="action-area" aria-labelledby="action-title">
      <h2 id="action-title" class="visually-hidden">変換</h2>
      <button id="convert-button" class="primary-button" type="button" disabled>EPUBに変換</button>
      <div id="conversion-progress" class="conversion-progress" role="progressbar" aria-label="変換の進捗" hidden>
        <span class="conversion-progress-bar" aria-hidden="true"></span>
      </div>
      <p id="conversion-continuity" class="conversion-continuity" hidden>変換が終わるまで、このページを閉じたり再読み込みしたりしないでください。ページを離れると処理が中断され、最初からやり直しになります。</p>
      <button id="cancel-button" class="text-button" type="button" hidden>キャンセル</button>
      <p id="conversion-status" class="action-explanation" aria-live="polite">PDFを選ぶと変換できます。</p>
      <a id="download-link" class="text-button" hidden>EPUBを保存</a>
    </section>
  </main>
`;

const input = document.querySelector<HTMLInputElement>("#pdf-input");
const selectedFile = document.querySelector<HTMLParagraphElement>("#selected-file");
const resetButton = document.querySelector<HTMLButtonElement>("#reset-file");
const convertButton = document.querySelector<HTMLButtonElement>("#convert-button");
const cancelButton = document.querySelector<HTMLButtonElement>("#cancel-button");
const conversionProgress = document.querySelector<HTMLDivElement>("#conversion-progress");
const conversionProgressBar = conversionProgress?.querySelector<HTMLSpanElement>(".conversion-progress-bar");
const conversionContinuity = document.querySelector<HTMLParagraphElement>("#conversion-continuity");
const conversionStatus = document.querySelector<HTMLParagraphElement>("#conversion-status");
const downloadLink = document.querySelector<HTMLAnchorElement>("#download-link");
const pdfjsStatus = document.querySelector<HTMLElement>("#pdfjs-status");
const binaryRuntimeStatus = document.querySelector<HTMLElement>("#binary-runtime-status");
const pwaStatus = document.querySelector<HTMLElement>("#pwa-status");
const runtimeMessage = document.querySelector<HTMLElement>("#runtime-message");
const runtimeBadge = document.querySelector<HTMLElement>("#runtime-badge");
const formatBytes = (bytes: number): string => `${bytes.toLocaleString("ja-JP")} bytes`;

let pdfJsReady: boolean | undefined;
let binaryRuntimeReady: boolean | undefined;
let pdfJsMessage = "PDF解析機能を確認中です。";
let binaryRuntimeMessage = "EPUB生成機能を確認中です。";
let selected: File | undefined;
let activeWorker: Worker | undefined;
let activeTracker: BrowserConversionEventTracker | undefined;
let activeRequestId: string | undefined;
let downloadUrl: string | undefined;
let requestCounter = 0;

function runtimeReady(): boolean {
  return pdfJsReady === true && binaryRuntimeReady === true;
}

function runtimeFailureGuidance(): string {
  if (!window.isSecureContext) {
    return "HTTPSで開かれていないため変換できません。HTTPSのURLから開き直してください。";
  }
  if (typeof Worker === "undefined") {
    return "このブラウザでは、PDF解析に必要なバックグラウンド処理（Web Worker）を使えません。Chrome、Edge、Firefox、Safariの最新版で開いてください。";
  }
  if (pdfJsReady === false) {
    return "PDFの解析機能を読み込めませんでした。まずページを再読み込みしてください。直らない場合は、広告ブロッカーやセキュリティ拡張を一時的に無効にして、もう一度お試しください。";
  }
  if (typeof globalThis.crypto?.subtle === "undefined") {
    return "このブラウザでは、EPUB生成に必要な機能を使えません。Chrome、Edge、Firefox、Safariの最新版で開いてください。";
  }
  if (typeof WebAssembly === "undefined") {
    return "このブラウザでは、EPUB生成に必要な機能を使えません。Chrome、Edge、Firefox、Safariの最新版で開いてください。";
  }
  if (binaryRuntimeReady === false) {
    return "EPUB生成に必要な圧縮機能を使えません。ページを再読み込みするか、Chrome、Edge、Firefox、Safariの最新版で開いてください。";
  }
  return "変換に必要なブラウザ機能を確認できませんでした。ページを再読み込みしてください。直らない場合は、Chrome、Edge、Firefox、Safariの最新版で開いてください。";
}

function updateConvertAvailability(): void {
  if (!convertButton) return;
  convertButton.disabled = !runtimeReady() || selected === undefined || activeWorker !== undefined;
}

function clearDownload(): void {
  if (downloadUrl !== undefined) URL.revokeObjectURL(downloadUrl);
  downloadUrl = undefined;
  if (downloadLink) {
    downloadLink.hidden = true;
    downloadLink.removeAttribute("href");
    downloadLink.removeAttribute("download");
  }
}

function hideConversionProgress(): void {
  if (!conversionProgress) return;
  conversionProgress.hidden = true;
  conversionProgress.classList.remove("is-indeterminate");
  conversionProgress.removeAttribute("aria-valuemin");
  conversionProgress.removeAttribute("aria-valuemax");
  conversionProgress.removeAttribute("aria-valuenow");
  conversionProgress.setAttribute("aria-label", "変換の進捗");
  if (conversionProgressBar) conversionProgressBar.style.width = "0%";
}

function showIndeterminateProgress(label: string): void {
  if (!conversionProgress) return;
  conversionProgress.hidden = false;
  conversionProgress.classList.add("is-indeterminate");
  conversionProgress.removeAttribute("aria-valuemin");
  conversionProgress.removeAttribute("aria-valuemax");
  conversionProgress.removeAttribute("aria-valuenow");
  conversionProgress.setAttribute("aria-label", label);
  if (conversionProgressBar) conversionProgressBar.style.removeProperty("width");
}

function showDeterminateProgress(completed: number, total: number, label: string): void {
  if (!conversionProgress) return;
  const safeTotal = Math.max(1, total);
  const safeCompleted = Math.min(safeTotal, Math.max(0, completed));
  conversionProgress.hidden = false;
  conversionProgress.classList.remove("is-indeterminate");
  conversionProgress.setAttribute("aria-valuemin", "0");
  conversionProgress.setAttribute("aria-valuemax", String(safeTotal));
  conversionProgress.setAttribute("aria-valuenow", String(safeCompleted));
  conversionProgress.setAttribute("aria-label", label);
  if (conversionProgressBar) conversionProgressBar.style.width = `${(safeCompleted / safeTotal) * 100}%`;
}

function showConversionContinuity(show: boolean): void {
  if (conversionContinuity) conversionContinuity.hidden = !show;
}

function showFile(file: File | undefined): void {
  selected = file;
  if (!selectedFile || !resetButton) return;
  if (!file) {
    selectedFile.textContent = "PDFが選択されていません。";
    resetButton.hidden = true;
    if (conversionStatus) conversionStatus.textContent = "PDFを選ぶと変換できます。";
    updateConvertAvailability();
    return;
  }
  selectedFile.textContent = `${file.name} — ${formatBytes(file.size)}`;
  resetButton.hidden = false;
  if (conversionStatus) conversionStatus.textContent = runtimeReady() ? "変換の準備ができました。" : "動作環境を確認しています。";
  updateConvertAvailability();
}

input?.addEventListener("change", () => {
  const file = input.files?.[0];
  clearDownload();
  hideConversionProgress();
  showConversionContinuity(false);
  if (file && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))) showFile(file);
  else {
    input.value = "";
    showFile(undefined);
  }
});
resetButton?.addEventListener("click", () => {
  if (activeWorker) return;
  if (input) input.value = "";
  clearDownload();
  hideConversionProgress();
  showConversionContinuity(false);
  showFile(undefined);
  input?.focus();
});

async function registerOfflineShell(): Promise<void> {
  if (!pwaStatus) return;
  if (!("serviceWorker" in navigator) || !window.isSecureContext) {
    pwaStatus.textContent = "この環境では未対応";
    return;
  }
  try {
    const appBase = new URL(import.meta.env.BASE_URL, location.href);
    const registration = await navigator.serviceWorker.register(new URL("service-worker.js", appBase), { scope: appBase.pathname });
    await navigator.serviceWorker.ready;
    pwaStatus.textContent = registration.active ? "利用可能" : "準備中";
  } catch {
    pwaStatus.textContent = "登録できません";
  }
}

function renderRuntimeReadiness(): void {
  if (!runtimeMessage || !runtimeBadge) return;
  if (pdfJsReady === undefined || binaryRuntimeReady === undefined) {
    runtimeBadge.dataset.state = "checking";
    runtimeBadge.textContent = "確認中";
    runtimeMessage.textContent = "変換に必要な機能を確認しています。";
    updateConvertAvailability();
    return;
  }
  const supported = runtimeReady();
  runtimeBadge.dataset.state = supported ? "supported" : "unsupported";
  runtimeBadge.textContent = supported ? "変換可能" : "利用不可";
  runtimeMessage.textContent = supported
    ? "変換できます。"
    : runtimeFailureGuidance();
  if (selected && conversionStatus && activeWorker === undefined) {
    conversionStatus.textContent = supported ? "変換の準備ができました。" : "このブラウザでは変換できません。上の案内を確認してください。";
  }
  updateConvertAvailability();
}

function showPdfProbe(result: PdfJsProbeResult): void {
  if (!pdfjsStatus) return;
  pdfJsReady = result.state === "supported" && result.realWorkerPort;
  pdfJsMessage = result.message;
  pdfjsStatus.textContent = pdfJsReady ? "確認済み" : "要確認";
  if (!pdfJsReady) console.warn("FileShape PDF runtime probe:", pdfJsMessage);
  renderRuntimeReadiness();
}

function showBinaryProbe(result: BinaryRuntimeProbeResult): void {
  if (!binaryRuntimeStatus) return;
  binaryRuntimeReady = result.state === "supported";
  binaryRuntimeMessage = result.message;
  binaryRuntimeStatus.textContent = binaryRuntimeReady ? "確認済み" : "要確認";
  if (!binaryRuntimeReady) console.warn("FileShape binary runtime probe:", binaryRuntimeMessage);
  renderRuntimeReadiness();
}

function readOptions(): BrowserConversionOptions {
  const options: BrowserConversionOptions = {};
  const value = (name: string): string => document.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value ?? "";
  const title = value("title");
  const creator = value("creator");
  const language = value("language");
  const modified = value("modified");
  const rubyMode = document.querySelector<HTMLSelectElement>('[name="rubyMode"]')?.value;
  if (title.trim().length > 0) options.title = title;
  if (creator.trim().length > 0) options.creator = creator;
  if (language.trim().length > 0) options.language = language;
  if (modified.trim().length > 0) options.modified = modified;
  if (rubyMode === "on" || rubyMode === "off") options.rubyMode = rubyMode;
  return options;
}

function cleanupWorker(): void {
  activeWorker?.terminate();
  activeWorker = undefined;
  activeTracker = undefined;
  activeRequestId = undefined;
  if (cancelButton) cancelButton.hidden = true;
  hideConversionProgress();
  showConversionContinuity(false);
  updateConvertAvailability();
}

function progressLabel(phase: string): string {
  switch (phase) {
    case "loading-pdf": return "PDFを読み込み中";
    case "inspecting-pages": return "ページを解析中";
    case "building-document": return "文書構造を構築中";
    case "serializing-epub": return "EPUBを生成中";
    default: return "変換中";
  }
}

function totalPagesFromProgress(totalUnits: number | undefined): number | undefined {
  if (totalUnits === undefined || totalUnits < 2) return undefined;
  const pageUnits = totalUnits - 2;
  if (pageUnits % 3 !== 0) return undefined;
  return pageUnits / 3;
}

function renderProgress(
  phase: string,
  completedUnits: number,
  totalUnits: number | undefined,
): void {
  const label = progressLabel(phase);
  const totalPages = totalPagesFromProgress(totalUnits);

  if (phase === "inspecting-pages" && totalPages !== undefined) {
    const completedPages = Math.min(totalPages, Math.max(0, completedUnits - 1));
    const status = `${label} ${completedPages.toLocaleString("ja-JP")}/${totalPages.toLocaleString("ja-JP")}ページ`;
    showDeterminateProgress(completedPages, totalPages, status);
    if (conversionStatus) conversionStatus.textContent = status;
    return;
  }

  if (phase === "building-document" && totalPages !== undefined) {
    const buildStartUnits = 1 + totalPages;
    const completedBuildUnits = Math.min(totalPages * 2, Math.max(0, completedUnits - buildStartUnits));

    if (completedBuildUnits >= totalPages * 2) {
      const status = "文書構造を仕上げています。ページ数の多いPDFは数分かかることがあります。";
      showIndeterminateProgress("文書構造を仕上げ中");
      if (conversionStatus) conversionStatus.textContent = status;
      return;
    }

    let status: string;
    if (completedBuildUnits <= totalPages) {
      const analyzedPages = completedBuildUnits;
      status = `文書構造を解析中 ${analyzedPages.toLocaleString("ja-JP")}/${totalPages.toLocaleString("ja-JP")}ページ`;
    } else {
      const builtPages = completedBuildUnits - totalPages;
      status = `文書構造を構築中 ${builtPages.toLocaleString("ja-JP")}/${totalPages.toLocaleString("ja-JP")}ページ`;
    }
    showDeterminateProgress(completedBuildUnits, totalPages * 2, status);
    if (conversionStatus) conversionStatus.textContent = status;
    return;
  }

  showIndeterminateProgress(label);
  if (conversionStatus) {
    const longPhase = phase === "serializing-epub";
    conversionStatus.textContent = longPhase
      ? "EPUBを生成しています。ページ数の多いPDFは数分かかることがあります。"
      : label;
  }
}

convertButton?.addEventListener("click", async () => {
  const file = selected;
  if (!file || !runtimeReady() || activeWorker) return;
  clearDownload();
  convertButton.disabled = true;
  showIndeterminateProgress("PDFを読み込み中");
  if (conversionStatus) conversionStatus.textContent = "PDFを読み込んでいます。";

  try {
    const buffer = await file.arrayBuffer();
    const requestId = `request-${Date.now()}-${++requestCounter}`;
    const tracker = new BrowserConversionEventTracker(requestId);
    const worker = new ConversionWorker({ name: "fileshape-conversion" });
    activeWorker = worker;
    activeTracker = tracker;
    activeRequestId = requestId;
    if (cancelButton) cancelButton.hidden = false;
    showConversionContinuity(true);

    worker.addEventListener("message", (message: MessageEvent<unknown>) => {
      if (worker !== activeWorker || tracker !== activeTracker) return;
      try {
        const event = tracker.apply(message.data);
        if (event.kind === "accepted") {
          showIndeterminateProgress("変換を開始");
          if (conversionStatus) conversionStatus.textContent = "変換を開始しました。";
          return;
        }
        if (event.kind === "progress") {
          renderProgress(event.phase, event.completedUnits, event.totalUnits);
          return;
        }
        if (event.kind === "succeeded") {
          const blob = new Blob([event.epub], { type: "application/epub+zip" });
          downloadUrl = URL.createObjectURL(blob);
          if (downloadLink) {
            downloadLink.href = downloadUrl;
            downloadLink.download = event.outputName;
            downloadLink.hidden = false;
          }
          if (conversionStatus) conversionStatus.textContent = `${event.pageCount}ページをEPUBに変換しました（${formatBytes(event.byteLength)}）。`;
          cleanupWorker();
          return;
        }
        if (event.kind === "cancelled") {
          if (conversionStatus) conversionStatus.textContent = "変換をキャンセルしました。";
          cleanupWorker();
          return;
        }
        if (event.kind === "failed") {
          if (conversionStatus) conversionStatus.textContent = `変換できませんでした: ${event.message}`;
          cleanupWorker();
        }
      } catch (error) {
        if (conversionStatus) conversionStatus.textContent = `変換処理から正しい応答を受け取れませんでした: ${error instanceof Error ? error.message : String(error)}`;
        cleanupWorker();
      }
    });
    worker.addEventListener("error", (event) => {
      if (worker !== activeWorker) return;
      if (conversionStatus) conversionStatus.textContent = `変換処理でエラーが発生しました: ${event.message}`;
      cleanupWorker();
    });

    const start: BrowserStartMessage = {
      kind: "start",
      requestId,
      sourceName: file.name,
      buffer,
      options: readOptions(),
    };
    worker.postMessage(start, [buffer]);
  } catch (error) {
    if (conversionStatus) conversionStatus.textContent = `変換を開始できませんでした: ${error instanceof Error ? error.message : String(error)}`;
    cleanupWorker();
  }
});

cancelButton?.addEventListener("click", () => {
  if (!activeWorker || !activeTracker || !activeRequestId) return;
  activeTracker.requestCancel();
  activeWorker.postMessage({ kind: "cancel", requestId: activeRequestId });
  cancelButton.hidden = true;
  showIndeterminateProgress("キャンセル中");
  if (conversionStatus) conversionStatus.textContent = "キャンセルしています。";
});

window.addEventListener("beforeunload", (event) => {
  if (!activeWorker) return;
  event.preventDefault();
  event.returnValue = "";
});

window.addEventListener("pagehide", () => {
  activeWorker?.terminate();
  if (downloadUrl !== undefined) URL.revokeObjectURL(downloadUrl);
});

renderRuntimeReadiness();
void registerOfflineShell();
void probePdfJsRuntime().then(showPdfProbe, () => {
  showPdfProbe({
    state: "unsupported",
    message: "PDF解析機能を確認できませんでした。",
    realWorkerPort: false,
  });
});
void probeBinaryRuntime().then(showBinaryProbe, () => {
  showBinaryProbe({
    state: "unsupported",
    message: "EPUB生成に必要な圧縮機能を確認できませんでした。",
  });
});