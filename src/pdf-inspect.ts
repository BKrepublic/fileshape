import { writeFile } from "node:fs/promises";
import process from "node:process";
import { inspectPdf, type InspectResult } from "./pdf-inspector.js";

function printReport(result: InspectResult, outputPath: string): boolean {
  const totalTextItems = result.pages.reduce((sum, page) => sum + page.textItemCount, 0);
  const textPages = result.pages.filter((page) => page.textItemCount > 0).length;
  const checks = [
    {
      label: "PDF file contains data",
      ok: result.byteLength > 0,
      detail: `${result.byteLength.toLocaleString()} bytes`,
    },
    {
      label: "PDF contains pages",
      ok: result.pageCount > 0,
      detail: `${result.pageCount} pages`,
    },
    {
      label: "All pages were inspected",
      ok: result.pages.length === result.pageCount,
      detail: `${result.pages.length}/${result.pageCount} pages`,
    },
    {
      label: "Text was extracted",
      ok: totalTextItems > 0,
      detail: `${totalTextItems.toLocaleString()} text items on ${textPages}/${result.pageCount} pages`,
    },
  ];

  console.log("\n=== FileShape PDF inspection ===");
  console.log(`File: ${result.file}`);
  console.log(`JSON: ${outputPath}`);
  console.log("");

  for (const check of checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"}  ${check.label} (${check.detail})`);
  }

  const passed = checks.every((check) => check.ok);
  console.log("");
  console.log(`RESULT: ${passed ? "PASS" : "FAIL"}`);
  return passed;
}

function parseArguments(args: string[]): {
  inputPath: string | undefined;
  outputPath: string | undefined;
} {
  const inputPath = args[0];
  let outputPath: string | undefined;

  for (let index = 1; index < args.length; index += 1) {
    if (args[index] === "--output") {
      outputPath = args[index + 1];
      index += 1;
    }
  }

  return { inputPath, outputPath };
}

async function main() {
  const { inputPath, outputPath } = parseArguments(process.argv.slice(2));

  if (!inputPath) {
    console.error("Usage: npm run inspect:pdf -- <path-to-pdf> [--output <path-to-json>]");
    process.exitCode = 1;
    return;
  }

  try {
    const result = await inspectPdf(inputPath);

    if (!outputPath) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    const passed = printReport(result, outputPath);
    if (!passed) process.exitCode = 1;
  } catch (error) {
    console.error("\n=== FileShape PDF inspection ===");
    console.error("RESULT: FAIL");
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  }
}

await main();
