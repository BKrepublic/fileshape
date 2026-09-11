import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DEFAULT_EPUBCHECK_JAR, EPUBCHECK_VERSION } from "./epubcheck-config.js";

export type EpubCheckResult = {
  version: string;
  exitCode: number;
  valid: boolean;
  fatalErrors: number;
  errors: number;
  warnings: number;
  usage: number;
  messages: Array<{ id: string; severity: string; message: string }>;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A successful process exit alone is insufficient evidence of a completed check. */
export function parseEpubCheckReport(json: string, exitCode: number): EpubCheckResult {
  const report: unknown = JSON.parse(json);
  if (!record(report) || !record(report.checker) || !Array.isArray(report.messages)) {
    throw new Error("Invalid EPUBCheck report: missing checker or messages");
  }
  const checker = report.checker;
  if (checker.checkerVersion !== EPUBCHECK_VERSION) {
    throw new Error(`Expected EPUBCheck ${EPUBCHECK_VERSION}, got ${String(checker.checkerVersion)}`);
  }
  const count = (key: string): number => {
    const value = checker[key];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
      throw new Error(`Invalid EPUBCheck report: ${key} must be a nonnegative integer`);
    }
    return value;
  };
  const fatalErrors = count("nFatal");
  const errors = count("nError");
  const warnings = count("nWarning");
  const usage = count("nUsage");
  const messages = report.messages.map((message: unknown) => {
    if (!record(message) || typeof message.ID !== "string" ||
        typeof message.severity !== "string" || typeof message.message !== "string") {
      throw new Error("Invalid EPUBCheck report: malformed message");
    }
    return { id: message.ID, severity: message.severity, message: message.message };
  });
  return {
    version: EPUBCHECK_VERSION,
    exitCode,
    valid: exitCode === 0 && fatalErrors + errors + warnings === 0 &&
      !messages.some((message) => ["FATAL", "ERROR", "WARNING"].includes(message.severity)),
    fatalErrors,
    errors,
    warnings,
    usage,
    messages,
  };
}

function runJava(command: string, args: string[], timeout: number): Promise<{
  exitCode: number; stdout: string; stderr: string;
}> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: "utf8", timeout, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error && (typeof error.code !== "number" || error.killed || error.signal)) {
        reject(new Error(`Could not run EPUBCheck: ${error.message}`, { cause: error }));
      } else {
        resolve({ exitCode: typeof error?.code === "number" ? error.code : 0, stdout, stderr });
      }
    });
  });
}

export type EpubChecker = {
  version: string;
  check: (epubPath: string, reportPath?: string) => Promise<EpubCheckResult>;
};

/** Java is a development-time validator dependency, never part of conversion. */
export async function createEpubChecker(options: {
  jarPath?: string;
  javaCommand?: string;
} = {}): Promise<EpubChecker> {
  const jar = path.resolve(options.jarPath ?? process.env.EPUBCHECK_JAR ?? DEFAULT_EPUBCHECK_JAR);
  const java = options.javaCommand ?? "java";
  if (!(await stat(jar).catch(() => undefined))?.isFile()) {
    throw new Error(`EPUBCheck JAR is unavailable: ${jar}. Run npm run setup:epubcheck or set EPUBCHECK_JAR (keep lib/ beside the JAR).`);
  }
  const version = await runJava(java, ["-jar", jar, "--version"], 30_000);
  if (version.exitCode !== 0 || version.stdout.trim() !== `EPUBCheck v${EPUBCHECK_VERSION}`) {
    throw new Error(`Expected EPUBCheck ${EPUBCHECK_VERSION}; version check failed: ${version.stdout.trim()} ${version.stderr.trim()}`);
  }

  return {
    version: EPUBCHECK_VERSION,
    async check(epubPath, reportPath) {
      const input = path.resolve(epubPath);
      if (!(await stat(input)).isFile()) throw new Error(`EPUBCheck input is not a file: ${input}`);
      const temporary = await mkdtemp(path.join(os.tmpdir(), "fileshape-epubcheck-"));
      try {
        const report = path.join(temporary, "report.json");
        const run = await runJava(java, [
          "-jar", jar, input, "--json", report, "--failonwarnings", "--locale", "en", "--quiet",
        ], 300_000);
        const json = await readFile(report, "utf8").catch((error: unknown) => {
          throw new Error(`EPUBCheck produced no readable JSON report (exit ${run.exitCode}): ${run.stderr.trim()}`, { cause: error });
        });
        if (reportPath !== undefined) await writeFile(reportPath, json, { flag: "wx" });
        return parseEpubCheckReport(json, run.exitCode);
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
    },
  };
}

export function epubCheckSummary(result: EpubCheckResult): string {
  return `EPUBCheck ${result.version}: ${result.valid ? "PASS" : "FAIL"}; ` +
    `fatals=${result.fatalErrors}, errors=${result.errors}, warnings=${result.warnings}, usage=${result.usage}, exit=${result.exitCode}`;
}
