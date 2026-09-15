import "./ui-enhancements.css";
import { icon } from "./ui-icons.js";

function replaceButtonContent(selector: string, iconName: Parameters<typeof icon>[0], label: string): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return;
  element.innerHTML = `${icon(iconName)}<span>${label}</span>`;
}

function setFieldLabel(label: HTMLLabelElement, title: string, help: string): void {
  const field = label.querySelector<HTMLInputElement | HTMLSelectElement>("input, select");
  if (!field) return;
  const helpId = `${field.name || "field"}-help`;
  const titleElement = document.createElement("span");
  titleElement.className = "field-label";
  titleElement.textContent = title;
  const helpElement = document.createElement("small");
  helpElement.id = helpId;
  helpElement.className = "field-help";
  helpElement.textContent = help;
  field.setAttribute("aria-describedby", helpId);
  label.replaceChildren(titleElement, field, helpElement);
}

function enhanceAdvancedSettings(): void {
  const settings = document.querySelector<HTMLDetailsElement>("details.advanced-settings");
  const grid = settings?.querySelector<HTMLElement>(".advanced-grid");
  const summary = settings?.querySelector<HTMLElement>(":scope > summary");
  if (!settings || !grid || !summary || settings.dataset.enhanced === "true") return;
  settings.dataset.enhanced = "true";

  summary.innerHTML = `
    <span class="summary-title">${icon("settings-2")}<span>詳細設定</span></span>
    <span class="summary-caption">通常は変更不要</span>
    ${icon("chevron-down", "summary-chevron")}
  `;

  const languageInput = grid.querySelector<HTMLInputElement>('[name="language"]');
  const modifiedInput = grid.querySelector<HTMLInputElement>('[name="modified"]');
  const languageLabel = languageInput?.closest<HTMLLabelElement>("label");
  const modifiedLabel = modifiedInput?.closest<HTMLLabelElement>("label");

  if (languageInput && languageLabel) {
    languageInput.readOnly = true;
    languageInput.setAttribute("aria-readonly", "true");
    setFieldLabel(
      languageLabel,
      "EPUB言語タグ",
      "現在の変換・実ファイル検証は日本語向けです。ここはEPUBメタデータで、変換ロジックの言語切替ではありません。",
    );
  }

  if (modifiedInput && modifiedLabel) {
    setFieldLabel(
      modifiedLabel,
      "更新日時を上書き",
      "通常は空欄でOKです。未指定なら変換した時刻を自動設定します。再現可能なEPUBが必要な場合だけUTC時刻を指定します。",
    );
  }

  if (languageLabel || modifiedLabel) {
    const metadata = document.createElement("details");
    metadata.className = "metadata-settings";
    metadata.innerHTML = `
      <summary>
        <span class="summary-title">${icon("file-text")}<span>EPUBメタデータ</span></span>
        <span class="summary-caption">上級者向け</span>
        ${icon("chevron-down", "summary-chevron")}
      </summary>
      <div class="metadata-grid"></div>
    `;
    const metadataGrid = metadata.querySelector<HTMLElement>(".metadata-grid");
    if (languageLabel) metadataGrid?.append(languageLabel);
    if (modifiedLabel) metadataGrid?.append(modifiedLabel);
    const supporting = settings.querySelector(".supporting-text");
    settings.insertBefore(metadata, supporting ?? null);
  }

  const supporting = settings.querySelector<HTMLElement>(".supporting-text");
  if (supporting) supporting.textContent = "普段はタイトル、作成者、ルビだけ調整すれば十分です。";
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
      <strong>PDFファイルを選ぶ</strong>
      <span>クリックして選択、またはここへドロップ</span>
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

function enhanceCoreUi(): void {
  const intro = document.querySelector<HTMLElement>(".intro");
  const eyebrow = intro?.querySelector<HTMLElement>(".eyebrow");
  if (eyebrow) eyebrow.textContent = "LOCAL PDF → EPUB";
  const introText = intro?.querySelector<HTMLElement>("p:last-child");
  if (introText) introText.textContent = "PDFをアップロードせず、このブラウザ内で解析してEPUBへ変換します。";

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

  const runtimeTitle = document.querySelector<HTMLElement>("#runtime-title");
  if (runtimeTitle && !runtimeTitle.querySelector("svg")) runtimeTitle.innerHTML = `${icon("circle-check")}<span>ブラウザの対応状況</span>`;

  replaceButtonContent("#convert-button", "sparkles", "EPUBに変換");
  replaceButtonContent("#reset-file", "rotate-ccw", "選択を解除");
  replaceButtonContent("#cancel-button", "x", "キャンセル");
  enhanceFilePicker();
  enhanceAdvancedSettings();
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
