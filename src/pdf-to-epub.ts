import { randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nodeBinaryRuntime } from "./binary-runtime-node.js";
import type { UnresolvedRubyPolicy } from "./content-policy.js";
import {
  parseCoverOccurrenceSelector,
} from "./cover-policy.js";
import type { EpubNavigationSummary } from "./epub-navigation.js";
import type { EpubPageProgressionDirection } from "./epub-package.js";
import type { EpubRubyMode } from "./epub-xhtml.js";
import { nodePdfJsResourceConfig } from "./pdf-inspector.js";
import {
  convertPdfBytesToEpubWithResources,
  type PdfBytesToEpubResult,
  type PdfToEpubOptions,
} from "./pdf-to-epub-core.js";

export { convertPdfBytesToEpubWithResources } from "./pdf-to-epub-core.js";
export type { PdfBytesToEpubResult, PdfToEpubOptions } from "./pdf-to-epub-core.js";

export type PdfToEpubResult = {
  inputPath: string;
  outputPath: string;
  documentId: string;
  pageCount: number;
  unresolvedAnnotationCount: number;
  byteLength: number;
  navigation: EpubNavigationSummary;
  coverImageResourceId?: string;
};

export const CLI_USAGE = "usage: npm run convert:epub -- input.pdf [output.epub] [--title TITLE] [--creator NAME] [--language TAG] [--identifier ID] [--modified YYYY-MM-DDTHH:MM:SSZ] [--title-prefix PREFIX] [--ruby on|off] [--unresolved-ruby error|preserve-as-page-note] [--page-progression-direction ltr|rtl] [--cover-occurrence PAGE:OPERATOR:OCCURRENCE]";

function defaultOutputPath(inputPath: string): string {
  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, `${parsed.name}.epub`);
}

function unresolvedRubyPolicy(value: string): UnresolvedRubyPolicy {
  if (value === "error" || value === "preserve-as-page-note") return value;
  throw new Error("--unresolved-ruby must be error or preserve-as-page-note");
}

function rubyMode(value: string): EpubRubyMode {
  if (value === "on" || value === "off") return value;
  throw new Error("--ruby must be on or off");
}

function pageProgressionDirection(value: string): EpubPageProgressionDirection {
  if (value === "ltr" || value === "rtl") return value;
  throw new Error("--page-progression-direction must be ltr or rtl");
}

export async function convertPdfBytesToEpub(
  sourceBytes: Uint8Array,
  sourceName: string,
  options: PdfToEpubOptions = {},
): Promise<PdfBytesToEpubResult> {
  return convertPdfBytesToEpubWithResources(
    sourceBytes,
    sourceName,
    options,
    nodePdfJsResourceConfig,
    nodeBinaryRuntime,
  );
}

export async function convertPdfToEpub(
  inputPath: string,
  outputPath = defaultOutputPath(inputPath),
  options: PdfToEpubOptions = {},
): Promise<PdfToEpubResult> {
  const absoluteInput = path.resolve(inputPath);
  const absoluteOutput = path.resolve(outputPath);
  if (absoluteInput === absoluteOutput) {
    throw new Error("output path must differ from input PDF path");
  }
  const sourceBytes = new Uint8Array(await readFile(absoluteInput));
  const converted = await convertPdfBytesToEpub(sourceBytes, path.basename(absoluteInput), options);

  const temporaryOutput = path.join(
    path.dirname(absoluteOutput),
    `.${path.basename(absoluteOutput)}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryOutput, converted.bytes, { flag: "wx" });
    await rename(temporaryOutput, absoluteOutput);
  } catch (error) {
    try { await unlink(temporaryOutput); } catch { /* best-effort cleanup */ }
    throw error;
  }
  return {
    inputPath: absoluteInput,
    outputPath: absoluteOutput,
    documentId: converted.documentId,
    pageCount: converted.pageCount,
    unresolvedAnnotationCount: converted.unresolvedAnnotationCount,
    byteLength: converted.byteLength,
    navigation: converted.navigation,
    ...(converted.coverImageResourceId === undefined ? {} : { coverImageResourceId: converted.coverImageResourceId }),
  };
}

export type CliArguments = {
  inputPath: string;
  outputPath?: string;
  options: PdfToEpubOptions;
};

export function parseCliArguments(argv: string[]): CliArguments {
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
      case "ruby": options.rubyMode = rubyMode(value); break;
      case "unresolved-ruby": options.unresolvedRubyPolicy = unresolvedRubyPolicy(value); break;
      case "page-progression-direction": options.pageProgressionDirection = pageProgressionDirection(value); break;
      case "cover-occurrence": options.coverOccurrence = parseCoverOccurrenceSelector(value); break;
      default: throw new Error(`unknown option --${name}`);
    }
  }

  const inputPath = positionals[0];
  if (!inputPath || positionals.length > 2) {
    throw new Error(CLI_USAGE);
  }
  const outputPath = positionals[1];
  return outputPath === undefined ? { inputPath, options } : { inputPath, outputPath, options };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(CLI_USAGE);
    return;
  }
  const parsed = parseCliArguments(argv);
  const result = await convertPdfToEpub(parsed.inputPath, parsed.outputPath, parsed.options);
  console.log(`EPUB=${result.outputPath}`);
  console.log(`PAGES=${result.pageCount}`);
  console.log(`UNRESOLVED_ANNOTATIONS=${result.unresolvedAnnotationCount}`);
  console.log(`BYTES=${result.byteLength}`);
  console.log(`DOCUMENT_ID=${result.documentId}`);
  console.log(`NAVIGATION=${result.navigation.mode}`);
  console.log(`OUTLINE_ENTRIES=${result.navigation.outlineEntries}`);
  console.log(`UNRESOLVED_OUTLINE_ENTRIES=${result.navigation.unresolvedOutlineEntries}`);
  if (result.coverImageResourceId !== undefined) {
    console.log(`COVER_IMAGE_RESOURCE_ID=${result.coverImageResourceId}`);
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
