import { cp, mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";

const EXPECTED_PDFJS_VERSION = "6.3.289";
const SOURCE_ROOT = path.resolve("node_modules/pdfjs-dist");
const TARGET_ROOT = path.resolve("web/public/pdfjs");
const RESOURCE_DIRECTORIES = ["cmaps", "standard_fonts", "wasm", "iccs"] as const;

async function assertDirectory(relative: string): Promise<void> {
  const info = await stat(path.join(SOURCE_ROOT, relative));
  if (!info.isDirectory()) throw new Error(`pdfjs-dist resource is not a directory: ${relative}`);
}

async function main(): Promise<void> {
  const packageJson = JSON.parse(await readFile(path.join(SOURCE_ROOT, "package.json"), "utf8")) as { version?: unknown };
  if (packageJson.version !== EXPECTED_PDFJS_VERSION) {
    throw new Error(`pdfjs-dist version mismatch: expected ${EXPECTED_PDFJS_VERSION}, got ${String(packageJson.version)}`);
  }

  for (const directory of RESOURCE_DIRECTORIES) await assertDirectory(directory);
  await rm(TARGET_ROOT, { recursive: true, force: true });
  await mkdir(TARGET_ROOT, { recursive: true });
  for (const directory of RESOURCE_DIRECTORIES) {
    await cp(path.join(SOURCE_ROOT, directory), path.join(TARGET_ROOT, directory), { recursive: true });
  }
  console.log(`Prepared PDF.js browser resources (${RESOURCE_DIRECTORIES.join(", ")}) for ${EXPECTED_PDFJS_VERSION}.`);
}

await main();
