import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDocumentFromInspection } from "./pdf-document-pipeline.js";
import { inspectPdf } from "./pdf-inspector.js";

const FIXED_MODIFIED = "2026-09-12T00:00:00Z";

type CliRun = {
  status: number;
  stdout: string;
  stderr: string;
};

type SelectedPdf = {
  path: string;
  pdfId: string;
  pages: number;
  unresolved: number;
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function nonNegativeInteger(value: string | undefined, flag: string): number {
  if (value === undefined) throw new Error(`missing value for ${flag}`);
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${flag} must be a non-negative integer`);
  return parsed;
}

async function pdfFiles(input: string): Promise<string[]> {
  const metadata = await stat(input);
  if (!metadata.isDirectory()) return [input];
  const files = (await readdir(input, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
    .map((entry) => path.join(input, entry.name))
    .sort();
  if (files.length === 0) throw new Error("no PDF files found");
  return files;
}

async function selectUnresolvedPdf(files: string[]): Promise<SelectedPdf> {
  for (const file of files) {
    const bytes = new Uint8Array(await readFile(file));
    const hash = sha256(bytes);
    const inspection = await inspectPdf(file, { includeGlyphs: true });
    const { document } = buildDocumentFromInspection(inspection, `urn:sha256:${hash}`);
    const unresolved = document.pages.reduce((sum, page) => sum + page.unresolvedRuby.length, 0);
    if (unresolved > 0) {
      return {
        path: file,
        pdfId: `sha256:${hash.slice(0, 16)}`,
        pages: document.pages.length,
        unresolved,
      };
    }
  }
  throw new Error("CLI strict-mode acceptance requires at least one PDF with unresolved ruby");
}

function runCli(args: string[]): CliRun {
  const executable = path.resolve(
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tsx.cmd" : "tsx",
  );
  const result = spawnSync(executable, ["src/pdf-to-epub.ts", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function requireSuccess(run: CliRun, label: string): void {
  if (run.status !== 0) {
    throw new Error(`${label} failed with exit ${run.status}: ${run.stderr.slice(-2000)}`);
  }
}

function requireFailure(run: CliRun, label: string): void {
  if (run.status === 0) throw new Error(`${label} unexpectedly succeeded`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const input = argv.shift();
  if (!input || input.startsWith("--")) {
    throw new Error("usage: npm run verify:cli -- PDF_OR_DIRECTORY --report NEW_FILE [--expect-pdf-count N]");
  }
  let reportPath: string | undefined;
  let expectedPdfs: number | undefined;
  while (argv.length > 0) {
    const flag = argv.shift()!;
    const value = argv.shift();
    if (flag === "--report") reportPath = value;
    else if (flag === "--expect-pdf-count") expectedPdfs = nonNegativeInteger(value, flag);
    else throw new Error(`unknown option ${flag}`);
  }
  if (!reportPath) throw new Error("--report NEW_FILE is required");

  const started = Date.now();
  const files = await pdfFiles(input);
  if (expectedPdfs !== undefined && files.length !== expectedPdfs) {
    throw new Error(`expected ${expectedPdfs} PDFs but found ${files.length}`);
  }
  const selected = await selectUnresolvedPdf(files);
  const scratch = path.join(
    path.dirname(path.resolve(reportPath)),
    `.stage25-cli-${process.pid}-${Date.now()}`,
  );
  await mkdir(scratch, { recursive: false });

  try {
    const outputA = path.join(scratch, "deterministic-a.epub");
    const outputB = path.join(scratch, "deterministic-b.epub");
    const strictOutput = path.join(scratch, "strict.epub");
    const preservedOutput = path.join(scratch, "preserved-on-failure.epub");
    const invalidOutput = path.join(scratch, "invalid-option.epub");
    const optionsOutput = path.join(scratch, "options.epub");

    const baseArgs = [selected.path, outputA, "--modified", FIXED_MODIFIED];
    const defaultA = runCli(baseArgs);
    requireSuccess(defaultA, "default CLI conversion A");
    if (!await exists(outputA)) throw new Error("default CLI conversion A did not create output");

    const defaultB = runCli([selected.path, outputB, "--modified", FIXED_MODIFIED]);
    requireSuccess(defaultB, "default CLI conversion B");
    const bytesA = new Uint8Array(await readFile(outputA));
    const bytesB = new Uint8Array(await readFile(outputB));
    const deterministic = sha256(bytesA) === sha256(bytesB);
    if (!deterministic) throw new Error("fixed-metadata CLI conversion is not byte deterministic");

    const strict = runCli([
      selected.path,
      strictOutput,
      "--modified", FIXED_MODIFIED,
      "--unresolved-ruby", "error",
    ]);
    requireFailure(strict, "strict unresolved-ruby conversion");
    if (!/requires unresolved ruby policy/i.test(strict.stderr)) {
      throw new Error(`strict mode failed for an unexpected reason: ${strict.stderr.slice(-2000)}`);
    }
    if (await exists(strictOutput)) throw new Error("strict failure left a new output file");

    const sentinel = "FILESHAPE-STAGE25-PRESERVE-ON-FAILURE\n";
    await writeFile(preservedOutput, sentinel, { flag: "wx" });
    const strictExisting = runCli([
      selected.path,
      preservedOutput,
      "--modified", FIXED_MODIFIED,
      "--unresolved-ruby", "error",
    ]);
    requireFailure(strictExisting, "strict conversion over existing output");
    if ((await readFile(preservedOutput, "utf8")) !== sentinel) {
      throw new Error("failed conversion modified an existing output file");
    }

    const invalid = runCli([selected.path, invalidOutput, "--not-an-option", "x"]);
    requireFailure(invalid, "invalid-option CLI conversion");
    if (!/unknown option --not-an-option/.test(invalid.stderr)) {
      throw new Error(`invalid option failed for an unexpected reason: ${invalid.stderr.slice(-2000)}`);
    }
    if (await exists(invalidOutput)) throw new Error("invalid option left an output file");

    const missing = runCli([]);
    requireFailure(missing, "missing-input CLI invocation");
    if (!/usage: npm run convert:epub/.test(missing.stderr)) {
      throw new Error(`missing input did not return usage: ${missing.stderr.slice(-2000)}`);
    }

    const help = runCli(["--help"]);
    requireSuccess(help, "CLI help");
    if (!/usage: npm run convert:epub/.test(help.stdout)) throw new Error("CLI help omitted usage text");

    const options = runCli([
      selected.path,
      optionsOutput,
      "--modified", FIXED_MODIFIED,
      "--title", "FileShape CLI acceptance",
      "--creator", "FileShape",
      "--language", "ja",
      "--identifier", "urn:fileshape:stage25-cli-acceptance",
      "--title-prefix", "Acceptance",
      "--ruby", "off",
      "--unresolved-ruby", "preserve-as-page-note",
      "--page-progression-direction", "rtl",
    ]);
    requireSuccess(options, "documented option-surface conversion");
    if (!await exists(optionsOutput)) throw new Error("documented option-surface conversion did not create output");

    const report = {
      schemaVersion: 1,
      pdfsAvailable: files.length,
      selectedPdfId: selected.pdfId,
      selectedPages: selected.pages,
      selectedUnresolved: selected.unresolved,
      fixedModified: FIXED_MODIFIED,
      defaultBytes: bytesA.byteLength,
      defaultSha256: sha256(bytesA),
      deterministicBytes: deterministic,
      strictRejected: true,
      failedOutputPreserved: true,
      invalidOptionRejected: true,
      missingInputRejected: true,
      helpSucceeded: true,
      documentedOptionsSucceeded: true,
      elapsedMs: Date.now() - started,
    };
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });

    process.stdout.write([
      "CLI_ACCEPTANCE=PASS",
      `PDFS=${report.pdfsAvailable}`,
      `SELECTED_PDF_ID=${report.selectedPdfId}`,
      `SELECTED_PAGES=${report.selectedPages}`,
      `SELECTED_UNRESOLVED=${report.selectedUnresolved}`,
      `DEFAULT_BYTES=${report.defaultBytes}`,
      `DETERMINISTIC_BYTES=${report.deterministicBytes ? "yes" : "no"}`,
      `STRICT_REJECTED=${report.strictRejected ? "yes" : "no"}`,
      `FAILED_OUTPUT_PRESERVED=${report.failedOutputPreserved ? "yes" : "no"}`,
      `INVALID_OPTION_REJECTED=${report.invalidOptionRejected ? "yes" : "no"}`,
      `MISSING_INPUT_REJECTED=${report.missingInputRejected ? "yes" : "no"}`,
      `HELP_SUCCEEDED=${report.helpSucceeded ? "yes" : "no"}`,
      `DOCUMENTED_OPTIONS_SUCCEEDED=${report.documentedOptionsSucceeded ? "yes" : "no"}`,
      `ELAPSED_MS=${report.elapsedMs}`,
    ].join("\n") + "\n");
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
