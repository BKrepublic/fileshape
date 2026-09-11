import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { inspectPdf } from "./pdf-inspector.js";
import { reconstructPageFlow } from "./text-flow.js";

type FileReport = {
  file: string;
  pageCount: number;
  textPages: number;
  verticalPages: number;
  horizontalPages: number;
  unknownPages: number[];
  emptyReconstructionPages: number[];
  reconstructedCharacters: number;
};

function parseArgs(args: string[]): {
  directory: string | undefined;
  outputPath: string | undefined;
} {
  const directory = args[0];
  let outputPath: string | undefined;

  for (let index = 1; index < args.length; index += 1) {
    if (args[index] === "--output") {
      outputPath = args[index + 1];
      index += 1;
    }
  }

  return { directory, outputPath };
}

async function inspectFile(inputPath: string): Promise<FileReport> {
  const result = await inspectPdf(inputPath);
  let textPages = 0;
  let verticalPages = 0;
  let horizontalPages = 0;
  let reconstructedCharacters = 0;
  const unknownPages: number[] = [];
  const emptyReconstructionPages: number[] = [];

  for (const page of result.pages) {
    if (page.textItemCount === 0) continue;
    textPages += 1;

    const flow = reconstructPageFlow(page);
    if (flow.orientation === "vertical") verticalPages += 1;
    if (flow.orientation === "horizontal") horizontalPages += 1;
    if (flow.orientation === "unknown") unknownPages.push(page.page);

    const text = flow.text.trim();
    if (text.length === 0) emptyReconstructionPages.push(page.page);
    reconstructedCharacters += [...text].length;
  }

  return {
    file: result.file,
    pageCount: result.pageCount,
    textPages,
    verticalPages,
    horizontalPages,
    unknownPages,
    emptyReconstructionPages,
    reconstructedCharacters,
  };
}

async function main() {
  const { directory, outputPath } = parseArgs(process.argv.slice(2));

  if (!directory) {
    console.error("Usage: npm run check:flow -- <pdf-directory> [--output <json-path>]");
    process.exitCode = 1;
    return;
  }

  try {
    const absoluteDirectory = path.resolve(directory);
    const names = (await readdir(absoluteDirectory))
      .filter((name) => name.toLowerCase().endsWith(".pdf"))
      .sort((left, right) => left.localeCompare(right, "ja"));

    console.log("\n=== FileShape full-document flow check ===");
    console.log(`Directory: ${absoluteDirectory}`);
    console.log(`PDFs: ${names.length}`);
    console.log("");

    const reports: FileReport[] = [];

    for (let index = 0; index < names.length; index += 1) {
      const name = names[index];
      if (!name) continue;

      console.log(`[${index + 1}/${names.length}] ${name}`);
      const report = await inspectFile(path.join(absoluteDirectory, name));
      reports.push(report);

      const passed = report.unknownPages.length === 0 && report.emptyReconstructionPages.length === 0;
      console.log(`${passed ? "PASS" : "FAIL"}  ${name}`);
      console.log(
        `pages: ${report.pageCount}, text: ${report.textPages}, vertical: ${report.verticalPages}, horizontal: ${report.horizontalPages}`,
      );
      console.log(`unknown pages: ${report.unknownPages.length}`);
      console.log(`empty reconstructed pages: ${report.emptyReconstructionPages.length}`);
      console.log(`reconstructed characters: ${report.reconstructedCharacters.toLocaleString()}`);
      if (!passed) {
        if (report.unknownPages.length > 0) {
          console.log(`unknown page numbers: ${report.unknownPages.slice(0, 20).join(", ")}`);
        }
        if (report.emptyReconstructionPages.length > 0) {
          console.log(
            `empty page numbers: ${report.emptyReconstructionPages.slice(0, 20).join(", ")}`,
          );
        }
      }
      console.log("");
    }

    if (outputPath) {
      await writeFile(
        outputPath,
        `${JSON.stringify({ directory: absoluteDirectory, files: reports }, null, 2)}\n`,
        "utf8",
      );
      console.log(`JSON: ${outputPath}`);
    }

    const failed = reports.filter(
      (report) => report.unknownPages.length > 0 || report.emptyReconstructionPages.length > 0,
    );

    console.log("=== Batch result ===");
    console.log(`PASS: ${reports.length - failed.length}/${reports.length}`);
    console.log(`FAIL: ${failed.length}/${reports.length}`);
    console.log(`RESULT: ${reports.length > 0 && failed.length === 0 ? "PASS" : "FAIL"}`);

    if (reports.length === 0 || failed.length > 0) process.exitCode = 1;
  } catch (error) {
    console.error("\n=== FileShape full-document flow check ===");
    console.error("RESULT: FAIL");
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  }
}

await main();
