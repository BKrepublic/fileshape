import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serializeEpubPackage, type EpubPackageOptions } from "./epub-package.js";
import { buildDocumentFromInspection } from "./pdf-document-pipeline.js";
import { inspectPdf } from "./pdf-inspector.js";

export type PdfToEpubOptions = Omit<EpubPackageOptions, "title" | "identifier"> & {
  title?: string;
  identifier?: string;
};

export type PdfToEpubResult = {
  inputPath: string;
  outputPath: string;
  documentId: string;
  pageCount: number;
  byteLength: number;
};

function defaultOutputPath(inputPath: string): string {
  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, `${parsed.name}.epub`);
}

function defaultTitle(inputPath: string): string {
  return path.parse(inputPath).name;
}

function sourceId(bytes: Uint8Array): string {
  return `urn:sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export async function convertPdfToEpub(
  inputPath: string,
  outputPath = defaultOutputPath(inputPath),
  options: PdfToEpubOptions = {},
): Promise<PdfToEpubResult> {
  const absoluteInput = path.resolve(inputPath);
  const absoluteOutput = path.resolve(outputPath);
  const sourceBytes = new Uint8Array(await readFile(absoluteInput));
  const documentId = sourceId(sourceBytes);
  const inspection = await inspectPdf(absoluteInput, { includeGlyphs: true });
  const { document } = buildDocumentFromInspection(inspection, documentId);

  const epub = serializeEpubPackage(document, {
    title: options.title ?? defaultTitle(absoluteInput),
    identifier: options.identifier ?? documentId,
    ...(options.creator === undefined ? {} : { creator: options.creator }),
    ...(options.language === undefined ? {} : { language: options.language }),
    ...(options.modified === undefined ? {} : { modified: options.modified }),
    ...(options.titlePrefix === undefined ? {} : { titlePrefix: options.titlePrefix }),
  });

  await writeFile(absoluteOutput, epub.bytes);
  return {
    inputPath: absoluteInput,
    outputPath: absoluteOutput,
    documentId,
    pageCount: document.pages.length,
    byteLength: epub.bytes.byteLength,
  };
}

type CliArguments = {
  inputPath: string;
  outputPath?: string;
  options: PdfToEpubOptions;
};

function parseCliArguments(argv: string[]): CliArguments {
  const positionals: string[] = [];
  const options: PdfToEpubOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (!argument.startsWith("--")) {
      positionals.push(argument);
      continue;
    }

    const name = argument.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`missing value for --${name}`);
    }
    index += 1;

    switch (name) {
      case "title": options.title = value; break;
      case "creator": options.creator = value; break;
      case "language": options.language = value; break;
      case "identifier": options.identifier = value; break;
      case "modified": options.modified = value; break;
      case "title-prefix": options.titlePrefix = value; break;
      default: throw new Error(`unknown option --${name}`);
    }
  }

  const inputPath = positionals[0];
  if (!inputPath || positionals.length > 2) {
    throw new Error(
      "usage: npm run convert:epub -- input.pdf [output.epub] [--title TITLE] [--creator NAME] [--language ja]",
    );
  }
  const outputPath = positionals[1];
  return outputPath === undefined ? { inputPath, options } : { inputPath, outputPath, options };
}

async function main(): Promise<void> {
  const parsed = parseCliArguments(process.argv.slice(2));
  const result = await convertPdfToEpub(parsed.inputPath, parsed.outputPath, parsed.options);
  console.log(`EPUB=${result.outputPath}`);
  console.log(`PAGES=${result.pageCount}`);
  console.log(`BYTES=${result.byteLength}`);
  console.log(`DOCUMENT_ID=${result.documentId}`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
