import { createHash, randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { UnresolvedRubyPolicy } from "./content-policy.js";
import {
  parseCoverOccurrenceSelector,
  resolveCoverImageResourceId,
  type CoverOccurrenceSelector,
} from "./cover-policy.js";
import {
  serializeEpubPackage,
  type EpubPackageOptions,
  type EpubPageProgressionDirection,
} from "./epub-package.js";
import { buildDocumentFromInspection } from "./pdf-document-pipeline.js";
import { inspectPdfBytes, nodePdfJsResourceConfig } from "./pdf-inspector.js";
import type { EpubNavigationSummary } from "./epub-navigation.js";
import type { EpubRubyMode } from "./epub-xhtml.js";

export type PdfToEpubOptions = Omit<EpubPackageOptions, "title" | "identifier" | "coverImageResourceId"> & {
  title?: string;
  identifier?: string;
  /** Exact source occurrence selected as cover. Omitted means no cover designation. */
  coverOccurrence?: CoverOccurrenceSelector;
};

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

function defaultTitle(inputPath: string): string {
  const lastDot = inputPath.lastIndexOf(".");
  return lastDot > 0 ? inputPath.slice(0, lastDot) : inputPath;
}

function sourceId(bytes: Uint8Array): string {
  return `urn:sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function validateSourceInput(sourceBytes: Uint8Array, sourceName: string): void {
  if (sourceName.length === 0) throw new Error("sourceName must not be empty");
  if (/[\\/\0]/.test(sourceName)) {
    throw new Error("sourceName must not contain path separators or NUL");
  }
  if (sourceBytes.byteLength === 0) throw new Error("PDF input must not be empty");
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

export type PdfBytesToEpubResult = {
  sourceName: string;
  bytes: Uint8Array;
  documentId: string;
  pageCount: number;
  unresolvedAnnotationCount: number;
  byteLength: number;
  navigation: EpubNavigationSummary;
  coverImageResourceId?: string;
};

export async function convertPdfBytesToEpub(
  sourceBytes: Uint8Array,
  sourceName: string,
  options: PdfToEpubOptions = {},
): Promise<PdfBytesToEpubResult> {
  validateSourceInput(sourceBytes, sourceName);
  const documentId = sourceId(sourceBytes);
  const inspection = await inspectPdfBytes(
    sourceBytes,
    sourceName,
    { includeGlyphs: true, includeImages: true },
    nodePdfJsResourceConfig,
  );
  const { document } = buildDocumentFromInspection(inspection, documentId);
  const unresolvedAnnotationCount = document.pages.reduce(
    (count, page) => count + page.unresolvedRuby.length,
    0,
  );
  const effectiveUnresolvedPolicy = options.unresolvedRubyPolicy ?? "preserve-as-page-note";
  const coverImageResourceId = options.coverOccurrence === undefined
    ? undefined
    : resolveCoverImageResourceId(document, options.coverOccurrence);

  const epub = serializeEpubPackage(document, {
    title: options.title ?? defaultTitle(sourceName),
    identifier: options.identifier ?? documentId,
    ...(options.creator === undefined ? {} : { creator: options.creator }),
    ...(options.language === undefined ? {} : { language: options.language }),
    ...(options.modified === undefined ? {} : { modified: options.modified }),
    ...(options.titlePrefix === undefined ? {} : { titlePrefix: options.titlePrefix }),
    ...(options.rubyMode === undefined ? {} : { rubyMode: options.rubyMode }),
    ...(options.pageProgressionDirection === undefined
      ? {}
      : { pageProgressionDirection: options.pageProgressionDirection }),
    ...(coverImageResourceId === undefined ? {} : { coverImageResourceId }),
    unresolvedRubyPolicy: effectiveUnresolvedPolicy,
  });

  const outputBytes = new Uint8Array(epub.bytes);
  return {
    sourceName,
    bytes: outputBytes,
    documentId,
    pageCount: document.pages.length,
    unresolvedAnnotationCount,
    byteLength: outputBytes.byteLength,
    navigation: epub.navigation,
    ...(coverImageResourceId === undefined ? {} : { coverImageResourceId }),
  };
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
