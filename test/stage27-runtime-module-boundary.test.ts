import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { nodePdfJsResourceConfig } from "../src/pdf-inspector.js";
import { inspectPdfBytes } from "../src/pdf-inspector-core.js";
import { convertPdfBytesToEpub } from "../src/pdf-to-epub.js";
import { convertPdfBytesToEpubWithResources } from "../src/pdf-to-epub-core.js";
import {
  generateRuntimeDependencyInventory,
  serializedInventory,
} from "../src/runtime-dependency-inventory.js";
import { pdfBytes } from "./pdf-fixture.js";

test("core modules keep the reviewed Node boundary", async () => {
  const [model, inspector, converter] = await Promise.all([
    readFile("src/pdf-inspection-model.ts", "utf8"),
    readFile("src/pdf-inspector-core.ts", "utf8"),
    readFile("src/pdf-to-epub-core.ts", "utf8"),
  ]);
  assert.doesNotMatch(model, /from\s+["']node:/u);
  assert.doesNotMatch(inspector, /from\s+["']node:/u);
  assert.doesNotMatch(converter, /from\s+["']node:(?:fs|path|url)["']/u);
  assert.doesNotMatch(converter, /\b(?:process|console|randomUUID)\b/u);
  assert.match(converter, /from\s+["']node:crypto["']/u);
});

test("resource-aware conversion preserves the Stage 26 byte contract", async () => {
  const source = new Uint8Array(pdfBytes());
  const options = { title: "Stage 27", modified: "2026-09-12T00:00:00Z" } as const;
  const [core, adapter] = await Promise.all([
    convertPdfBytesToEpubWithResources(source, "fixture.pdf", options, nodePdfJsResourceConfig),
    convertPdfBytesToEpub(source, "fixture.pdf", options),
  ]);
  assert.deepEqual(core.bytes, adapter.bytes);
  assert.deepEqual({ ...core, bytes: undefined }, { ...adapter, bytes: undefined });
  const inspected = await inspectPdfBytes(source, "fixture.pdf", {}, nodePdfJsResourceConfig);
  assert.equal(inspected.file, "fixture.pdf");
  assert.equal(inspected.byteLength, source.byteLength);
});

test("the committed dependency inventory is deterministic and fail-closed", async () => {
  const inventory = generateRuntimeDependencyInventory();
  const committed = await readFile("docs/stage27-runtime-dependency-inventory.json", "utf8");
  assert.equal(committed, serializedInventory(inventory));
  assert.deepEqual(inventory.unreachableValidationTooling, ["src/epubcheck.ts", "src/setup-epubcheck.ts"]);
  assert.deepEqual(inventory.absentBrowserContracts, [
    "worker-ownership", "progress", "cancellation", "diagnostics",
    "file-size-memory-policy", "download-save", "resource-cleanup",
  ]);
  const inspection = inventory.entrypoints.find((entry) => entry.path === "src/pdf-inspector-core.ts")!;
  const conversion = inventory.entrypoints.find((entry) => entry.path === "src/pdf-to-epub-core.ts")!;
  assert.deepEqual(inspection.directNodeBuiltins, []);
  assert.deepEqual(conversion.directNodeBuiltins, ["node:crypto"]);
  assert.deepEqual(conversion.transitiveNodeBuiltins, ["node:crypto", "node:zlib"]);
  assert.deepEqual(inventory.nodeAdapterProviders, [{
    path: "src/pdf-inspector.ts",
    exportName: "nodePdfJsResourceConfig",
    directNodeBuiltins: ["node:fs/promises", "node:path", "node:url"],
    configKeys: ["cMapPacked", "cMapUrl", "disableFontFace", "standardFontDataUrl", "useSystemFonts"],
  }]);
});
