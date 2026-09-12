import "./styles.css";
import { probeBinaryRuntime, type BinaryRuntimeProbeResult } from "./binary-runtime-probe.js";
import { probePdfJsRuntime, type PdfJsProbeResult } from "./pdfjs-runtime-probe.js";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("FileShape app root is missing");

app.innerHTML = `
  <header class="top-app-bar">
    <div class="brand-mark" aria-hidden="true">F</div>
    <div class="brand-copy"><strong>FileShape</strong><span>PDF to EPUB</span></div>
    <span class="status-chip"><span class="status-dot"></span>ローカル処理</span>
  </header>
  <main class="page-shell">
    <section class="intro" aria-labelledby="page-title">
      <p class="eyebrow">BROWSER / PWA</p>
      <h1 id="page-title">PDFを、手元でEPUBへ。</h1>
      <p>ファイルはこのブラウザのメモリだけで扱います。変換機能は現在準備中です。</p>
    </section>
    <section class="surface file-surface" aria-labelledby="file-title">
      <div class="section-heading"><div><h2 id="file-title">PDFを選択</h2><p>読み込むファイルを1つ選んでください。</p></div><span class="surface-icon" aria-hidden="true">↥</span></div>
      <label class="file-picker" for="pdf-input"><span class="file-picker-title">PDFファイルを選ぶ</span><span class="file-picker-hint">端末から選択</span></label>
      <input id="pdf-input" class="visually-hidden-input" type="file" accept="application/pdf,.pdf" />
      <p id="selected-file" class="selected-file" aria-live="polite">ファイルはまだ選択されていません。</p>
      <button id="reset-file" class="text-button" type="button" hidden>選択を解除</button>
    </section>
    <details class="surface advanced-settings">
      <summary>詳細設定 <span>CLIで使える項目</span></summary>
      <div class="advanced-grid">
        <label>タイトル<input type="text" name="title" placeholder="PDFのファイル名を使用" /></label>
        <label>作成者<input type="text" name="creator" placeholder="任意" /></label>
        <label>言語<input type="text" name="language" value="ja" /></label>
        <label>ルビ<select name="rubyMode"><option value="on">保持</option><option value="off">表示しない</option></select></label>
      </div>
      <p class="supporting-text">設定項目は変換worker接続後に有効になります。</p>
    </details>
    <section class="surface runtime-surface" aria-labelledby="runtime-title">
      <div class="section-heading"><div><h2 id="runtime-title">実行環境</h2><p>変換前にブラウザの準備状態を確認します。</p></div><span id="runtime-badge" class="state-badge" data-state="checking">確認中</span></div>
      <div class="runtime-row"><span>PDF.js 実ワーカー</span><strong id="pdfjs-status" aria-live="polite">確認中…</strong></div>
      <div class="runtime-row"><span>SHA-256 / zlib deflate</span><strong id="binary-runtime-status" aria-live="polite">確認中…</strong></div>
      <div class="runtime-row"><span>PWA オフラインshell</span><strong id="pwa-status" aria-live="polite">確認中…</strong></div>
      <p id="runtime-message" class="runtime-message" aria-live="polite">ブラウザ機能を確認しています。</p>
      <div class="blocker-box"><strong>残っている準備</strong><ul><li>PDF.jsのCMap・標準フォント・WASM resource package</li><li>専用workerへの実変換接続と取消・保存</li><li>端末メモリ上限と失敗時cleanupの実装</li></ul></div>
    </section>
    <section class="action-area" aria-labelledby="action-title">
      <h2 id="action-title" class="visually-hidden">変換</h2>
      <button id="convert-button" class="primary-button" type="button" disabled>EPUBに変換</button>
      <p id="conversion-explanation" class="action-explanation">実変換workerの接続が完了するまで利用できません。</p>
    </section>
  </main>
`;

const input = document.querySelector<HTMLInputElement>("#pdf-input");
const selectedFile = document.querySelector<HTMLParagraphElement>("#selected-file");
const resetButton = document.querySelector<HTMLButtonElement>("#reset-file");
const pdfjsStatus = document.querySelector<HTMLElement>("#pdfjs-status");
const binaryRuntimeStatus = document.querySelector<HTMLElement>("#binary-runtime-status");
const pwaStatus = document.querySelector<HTMLElement>("#pwa-status");
const runtimeMessage = document.querySelector<HTMLElement>("#runtime-message");
const runtimeBadge = document.querySelector<HTMLElement>("#runtime-badge");
const formatBytes = (bytes: number): string => `${bytes.toLocaleString("ja-JP")} bytes`;

let pdfJsReady: boolean | undefined;
let binaryRuntimeReady: boolean | undefined;
let pdfJsMessage = "PDF.js 実ワーカーを確認中です。";
let binaryRuntimeMessage = "SHA-256 / zlib deflate を確認中です。";

function showFile(file: File | undefined): void {
  if (!selectedFile || !resetButton) return;
  if (!file) {
    selectedFile.textContent = "ファイルはまだ選択されていません。";
    resetButton.hidden = true;
    return;
  }
  selectedFile.textContent = `${file.name} — ${formatBytes(file.size)}`;
  resetButton.hidden = false;
}

input?.addEventListener("change", () => {
  const file = input.files?.[0];
  if (file && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))) showFile(file);
  else {
    input.value = "";
    showFile(undefined);
  }
});
resetButton?.addEventListener("click", () => {
  if (input) input.value = "";
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
    runtimeMessage.textContent = [pdfJsMessage, binaryRuntimeMessage].join(" ");
    return;
  }
  const supported = pdfJsReady && binaryRuntimeReady;
  runtimeBadge.dataset.state = supported ? "supported" : "unsupported";
  runtimeBadge.textContent = supported ? "利用可能" : "要確認";
  runtimeMessage.textContent = supported
    ? "PDF.js 実ワーカー、Web Crypto SHA-256、CompressionStream deflate を確認しました。"
    : [pdfJsReady ? "" : pdfJsMessage, binaryRuntimeReady ? "" : binaryRuntimeMessage].filter(Boolean).join(" ");
}

function showPdfProbe(result: PdfJsProbeResult): void {
  if (!pdfjsStatus) return;
  pdfJsReady = result.state === "supported" && result.realWorkerPort;
  pdfJsMessage = result.message;
  pdfjsStatus.textContent = pdfJsReady ? "確認済み" : "要確認";
  renderRuntimeReadiness();
}

function showBinaryProbe(result: BinaryRuntimeProbeResult): void {
  if (!binaryRuntimeStatus) return;
  binaryRuntimeReady = result.state === "supported";
  binaryRuntimeMessage = result.message;
  binaryRuntimeStatus.textContent = binaryRuntimeReady ? "確認済み" : "要確認";
  renderRuntimeReadiness();
}

renderRuntimeReadiness();
void registerOfflineShell();
void probePdfJsRuntime().then(showPdfProbe, () => {
  showPdfProbe({
    state: "unsupported",
    message: "PDF.js のブラウザ実行環境を確認できませんでした。",
    realWorkerPort: false,
  });
});
void probeBinaryRuntime().then(showBinaryProbe, () => {
  showBinaryProbe({
    state: "unsupported",
    message: "ブラウザ向けbinary runtimeを確認できませんでした。",
  });
});
