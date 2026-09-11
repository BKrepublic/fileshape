import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_EPUBCHECK_JAR,
  EPUBCHECK_CACHE,
  EPUBCHECK_SHA256,
  EPUBCHECK_URL,
  EPUBCHECK_VERSION,
} from "./epubcheck-config.js";

async function main(): Promise<void> {
  const target = path.dirname(DEFAULT_EPUBCHECK_JAR);
  // Never replace an existing installation, including an incomplete one.
  const existing = await stat(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  if (existing) {
    execFileSync("java", ["-jar", DEFAULT_EPUBCHECK_JAR, "--version"], { stdio: "inherit" });
    console.log(`Already installed: ${target}`);
    return;
  }

  await mkdir(EPUBCHECK_CACHE, { recursive: true });
  const temporary = await mkdtemp(path.join(EPUBCHECK_CACHE, "download-"));
  try {
    console.log(`Downloading EPUBCheck ${EPUBCHECK_VERSION} from ${EPUBCHECK_URL}`);
    const response = await fetch(EPUBCHECK_URL, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`EPUBCheck download failed: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== EPUBCHECK_SHA256) throw new Error(`EPUBCheck SHA-256 mismatch: ${digest}`);
    const archive = path.join(temporary, "epubcheck.zip");
    await writeFile(archive, bytes);
    execFileSync("unzip", ["-q", archive, "-d", temporary], { stdio: "inherit" });
    const extracted = path.join(temporary, `epubcheck-${EPUBCHECK_VERSION}`);
    execFileSync("java", ["-jar", path.join(extracted, "epubcheck.jar"), "--version"], { stdio: "inherit" });
    await rename(extracted, target);
    console.log(`Installed: ${target}\nSHA256=${digest}`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
