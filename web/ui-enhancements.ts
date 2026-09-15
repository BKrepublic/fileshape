import "./ui-enhancements.css";
import { icon } from "./ui-icons.js";

function replaceButtonContent(selector: string, iconName: Parameters<typeof icon>[0], label: string): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return;
  element.innerHTML = `${icon(iconName)}<span>${label}</span>`;
}

function safeRequestedOutputName(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  const safe = trimmed.replace(/[\\/\0]+/g, "-");
  return /\.epub$/i.test(safe) ? safe : `${safe}.epub`;
}

function simplifyConversionSettings(): void {
  const current = document.querySelector<HTMLElement>(".advanced-settings");
  if (!current || current.dataset.enhanced === "true") return;

  const currentRubyMode = current.querySelector<HTMLSelectElement>('[name="rubyMode"]')?.value === "off" ? "off" : "on";
  const replacement = document.createElement("section");
  replacement.className = "surface advanced-settings conversion-settings";
  replacement.dataset.enhanced = "true";
  replacement.setAttribute("aria-labelledby", "conversion-settings-title");
  replacement.innerHTML = `
    <div class="settings-heading">
      <div class="settings-heading-copy">
        <span class="settings-heading-title" id="conversion-settings-title">${icon("settings-2")}<span>変換設定</span></span>
        <p>必要なときだけ変更してください。</p>
      </div>
    </div>
    <div class="settings-grid">
      <label>
        <span class="field-label">保存ファイル名</span>
        <input type="text" name="outputName" maxlength="240" placeholder="未入力なら元のPDF名を使用" />
        <small class="field-help">保存名を変えたいときだけ入力してください。「.epub」は付けなくても構いません。</small>
      </label>
      <label>
        <span class="field-label">ルビ</span>
        <select name="rubyMode">
          <option value="on">保持する</option>
          <option value="off">表示しない</option>
        </select>
        <small class="field-help">通常は「保持する」のままで問題ありません。</small>
      </label>
    </div>
    <input type="hidden" name="title" value="" />
  `;
  current.replaceWith(replacement);

  const rubyMode = replacement.querySelector<HTMLSelectElement>('[name="rubyMode"]');
  if (rubyMode) rubyMode.value = currentRubyMode;

  const outputName = replacement.querySelector<HTMLInputElement>('[name="outputName"]');
  const title = replacement.querySelector<HTMLInputElement>('[name="title"]');
  const downloadLink = document.querySelector<HTMLAnchorElement>("#download-link");
  if (outputName && title) {
    const syncTitle = (): void => {
      const requested = safeRequestedOutputName(outputName.value);
      title.value = requested?.replace(/\.epub$/i, "") ?? "";
    };
    outputName.addEventListener("input", syncTitle);
    syncTitle();
  }
  if (outputName && downloadLink) {
    downloadLink.addEventListener("click", () => {
      const requested = safeRequestedOutputName(outputName.value);
      if (requested) downloadLink.download = requested;
    });
  }
}

function enhanceFilePicker(): void {
  const input = document.querySelector<HTMLInputElement>("#pdf-input");
  const picker = document.querySelector<HTMLLabelElement>(".file-picker");
  const selectedFile = document.querySelector<HTMLElement>("#selected-file");
  if (!input || !picker || picker.dataset.enhanced === "true") return;
  picker.dataset.enhanced = "true";
  picker.innerHTML = `
    <span class="file-picker-icon">${icon("file-up")}</span>
    <span class="file-picker-copy">
      <strong>PDFを選ぶ</strong>
      <span>クリックして選ぶか、ここにドロップ</span>
    </span>
    <span class="file-picker-action">選択</span>
  `;

  const updateState = (): void => {
    const hasFile = Boolean(input.files?.[0]);
    picker.classList.toggle("has-file", hasFile);
    selectedFile?.classList.toggle("has-file", hasFile);
  };
  input.addEventListener("change", updateState);
  document.querySelector("#reset-file")?.addEventListener("click", () => queueMicrotask(updateState));

  const prevent = (event: DragEvent): void => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  };
  picker.addEventListener("dragenter", (event) => {
    prevent(event);
    picker.classList.add("is-dragging");
  });
  picker.addEventListener("dragover", prevent);
  picker.addEventListener("dragleave", (event) => {
    if (event.relatedTarget instanceof Node && picker.contains(event.relatedTarget)) return;
    picker.classList.remove("is-dragging");
  });
  picker.addEventListener("drop", (event) => {
    prevent(event);
    picker.classList.remove("is-dragging");
    const file = event.dataTransfer?.files?.[0];
    if (!file || !(file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  updateState();
}

function enhanceRuntimeStatus(): void {
  const surface = document.querySelector<HTMLElement>(".runtime-surface");
  const title = document.querySelector<HTMLElement>("#runtime-title");
  const subtitle = surface?.querySelector<HTMLElement>(".section-heading p");
  const badge = document.querySelector<HTMLElement>("#runtime-badge");
  const message = document.querySelector<HTMLElement>("#runtime-message");
  if (!surface || !title || !badge || !message || surface.dataset.enhanced === "true") return;
  surface.dataset.enhanced = "true";

  title.innerHTML = `${icon("circle-check")}<span>動作環境</span>`;
  if (subtitle) subtitle.textContent = "このブラウザで変換できるか確認します。";

  const sync = (): void => {
    const supported = badge.dataset.state === "supported";
    message.hidden = supported;
    surface.classList.toggle("runtime-supported", supported);
  };
  sync();
  new MutationObserver(sync).observe(badge, {
    attributes: true,
    attributeFilter: ["data-state"],
    childList: true,
    subtree: true,
  });
}

function enhanceCoreUi(): void {
  const intro = document.querySelector<HTMLElement>(".intro");
  const eyebrow = intro?.querySelector<HTMLElement>(".eyebrow");
  if (eyebrow) eyebrow.textContent = "LOCAL PDF → EPUB";
  const introText = intro?.querySelector<HTMLElement>("p:last-child");
  if (introText) introText.textContent = "PDFは外部へ送らず、このブラウザ内でEPUBに変換します。";

  if (intro && !document.querySelector(".workflow-strip")) {
    intro.insertAdjacentHTML("afterend", `
      <ol class="workflow-strip" aria-label="変換の流れ">
        <li>${icon("file-up")}<span><strong>1</strong> PDFを選ぶ</span></li>
        <li aria-hidden="true" class="workflow-arrow">${icon("arrow-right")}</li>
        <li>${icon("sparkles")}<span><strong>2</strong> 変換する</span></li>
        <li aria-hidden="true" class="workflow-arrow">${icon("arrow-right")}</li>
        <li>${icon("download")}<span><strong>3</strong> 保存する</span></li>
      </ol>
    `);
  }

  const statusChip = document.querySelector<HTMLElement>(".status-chip");
  if (statusChip) statusChip.innerHTML = `${icon("shield-check")}<span>端末内で処理</span>`;

  const surfaceIcon = document.querySelector<HTMLElement>(".file-surface .surface-icon");
  if (surfaceIcon) surfaceIcon.innerHTML = icon("file-up");

  replaceButtonContent("#convert-button", "sparkles", "EPUBに変換");
  replaceButtonContent("#reset-file", "rotate-ccw", "選択を解除");
  replaceButtonContent("#cancel-button", "x", "キャンセル");
  enhanceFilePicker();
  simplifyConversionSettings();
  enhanceRuntimeStatus();
}

function enhanceSiteInfo(attempt = 0): void {
  const siteInfo = document.querySelector<HTMLElement>(".site-info");
  if (!siteInfo) {
    if (attempt < 10) window.setTimeout(() => enhanceSiteInfo(attempt + 1), 20);
    return;
  }
  if (siteInfo.dataset.enhanced === "true") return;
  siteInfo.dataset.enhanced = "true";

  const cardIcons: Parameters<typeof icon>[0][] = ["shield-check", "scan-text", "book-open"];
  siteInfo.querySelectorAll<HTMLElement>(".site-info-grid article").forEach((card, index) => {
    card.insertAdjacentHTML("afterbegin", `<span class="info-card-icon">${icon(cardIcons[index] ?? "file-text")}</span>`);
  });

  siteInfo.querySelectorAll<HTMLAnchorElement>(".guide-links a").forEach((link) => {
    const label = link.textContent?.trim() ?? "ガイドを開く";
    link.innerHTML = `${icon("book-open")}<span>${label}</span>${icon("arrow-right", "guide-arrow")}`;
  });

  const downloadLink = document.querySelector<HTMLAnchorElement>("#download-link");
  if (downloadLink) downloadLink.innerHTML = `${icon("download")}<span>EPUBを保存</span>`;
}

function mountUiEnhancements(): void {
  enhanceCoreUi();
  enhanceSiteInfo();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountUiEnhancements, { once: true });
} else {
  mountUiEnhancements();
}
