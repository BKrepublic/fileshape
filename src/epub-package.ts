import type { FileShapeDocument } from "./document-model.js";
import {
  serializeEpubXhtml,
  type EpubXhtmlOptions,
} from "./epub-xhtml.js";

const EPUB_MIMETYPE = "application/epub+zip";
const CONTAINER_PATH = "META-INF/container.xml";
const PACKAGE_PATH = "OEBPS/package.opf";
const NAV_PATH = "OEBPS/nav.xhtml";
const UTF8_FLAG = 0x0800;

export type EpubPackageOptions = EpubXhtmlOptions & {
  title: string;
  identifier?: string;
  creator?: string;
  /** EPUB 3 dcterms:modified timestamp. Defaults to the current UTC second. */
  modified?: string;
};

export type EpubPackageFile = {
  path: string;
  mediaType: string;
  data: Uint8Array;
};

export type EpubPackageResult = {
  documentId: string;
  files: EpubPackageFile[];
  bytes: Uint8Array;
};

const encoder = new TextEncoder();

function xmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function xmlAttr(value: string): string {
  return xmlText(value)
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function requireNonEmpty(value: string, label: string): string {
  if (value.trim().length === 0) throw new Error(`${label} must not be empty`);
  return value;
}

function normalizeModified(value: string | undefined): string {
  const modified = value ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(modified)) {
    throw new Error("modified must be an EPUB UTC timestamp like 2026-09-11T12:34:56Z");
  }
  return modified;
}

function containerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n  <rootfiles>\n    <rootfile full-path="${PACKAGE_PATH}" media-type="application/oebps-package+xml"/>\n  </rootfiles>\n</container>\n`;
}

function navXhtml(title: string, language: string, pages: Array<{ sourcePage: number; href: string }>): string {
  const items = pages
    .map((page) => `        <li><a href="${xmlAttr(page.href)}">Page ${page.sourcePage}</a></li>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${xmlAttr(language)}" lang="${xmlAttr(language)}">\n  <head>\n    <meta charset="utf-8" />\n    <title>${xmlText(title)}</title>\n  </head>\n  <body>\n    <nav epub:type="toc" id="toc">\n      <h1>${xmlText(title)}</h1>\n      <ol>\n${items}\n      </ol>\n    </nav>\n  </body>\n</html>\n`;
}

function packageOpf(options: {
  title: string;
  language: string;
  identifier: string;
  creator?: string;
  modified: string;
  pages: Array<{ sourcePage: number; href: string; mediaType: string }>;
}): string {
  const creator = options.creator === undefined
    ? ""
    : `\n    <dc:creator>${xmlText(requireNonEmpty(options.creator, "creator"))}</dc:creator>`;
  const pageManifest = options.pages
    .map((page, index) => `    <item id="page-${index + 1}" href="${xmlAttr(page.href)}" media-type="${xmlAttr(page.mediaType)}"/>`)
    .join("\n");
  const spine = options.pages
    .map((_, index) => `    <itemref idref="page-${index + 1}"/>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="${xmlAttr(options.language)}">\n  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n    <dc:identifier id="pub-id">${xmlText(options.identifier)}</dc:identifier>\n    <dc:title>${xmlText(options.title)}</dc:title>\n    <dc:language>${xmlText(options.language)}</dc:language>${creator}\n    <meta property="dcterms:modified">${xmlText(options.modified)}</meta>\n  </metadata>\n  <manifest>\n    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>\n${pageManifest}\n  </manifest>\n  <spine>\n${spine}\n  </spine>\n</package>\n`;
}

function u16(value: number): Uint8Array {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function u32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) === 0 ? 0 : 0xedb88320);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

type ZipEntry = {
  path: string;
  data: Uint8Array;
};

function buildStoredZip(entries: ZipEntry[]): Uint8Array {
  if (entries.length === 0) throw new Error("EPUB archive must contain files");
  if (entries[0]?.path !== "mimetype") throw new Error("EPUB mimetype must be the first ZIP entry");

  const seen = new Set<string>();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    if (entry.path.length === 0 || entry.path.includes("\\")) throw new Error(`invalid ZIP path: ${entry.path}`);
    if (seen.has(entry.path)) throw new Error(`duplicate ZIP path: ${entry.path}`);
    seen.add(entry.path);

    const name = encoder.encode(entry.path);
    const crc = crc32(entry.data);
    const size = entry.data.length;
    const local = concat([
      u32(0x04034b50),
      u16(10),
      u16(UTF8_FLAG),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(size),
      u32(size),
      u16(name.length),
      u16(0),
      name,
      entry.data,
    ]);
    locals.push(local);

    centrals.push(concat([
      u32(0x02014b50),
      u16(20),
      u16(10),
      u16(UTF8_FLAG),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(size),
      u32(size),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(localOffset),
      name,
    ]));
    localOffset += local.length;
  }

  const centralDirectory = concat(centrals);
  if (entries.length > 0xffff) throw new Error("ZIP entry count exceeds classic ZIP limit");
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDirectory.length),
    u32(localOffset),
    u16(0),
  ]);
  return concat([...locals, centralDirectory, end]);
}

function textFile(path: string, mediaType: string, text: string): EpubPackageFile {
  return { path, mediaType, data: encoder.encode(text) };
}

export function serializeEpubPackage(
  document: FileShapeDocument,
  options: EpubPackageOptions,
): EpubPackageResult {
  const title = requireNonEmpty(options.title, "title");
  const language = requireNonEmpty(options.language ?? "ja", "language");
  const identifier = requireNonEmpty(options.identifier ?? document.id, "identifier");
  const modified = normalizeModified(options.modified);

  const xhtml = serializeEpubXhtml(document, {
    language,
    titlePrefix: options.titlePrefix ?? title,
    ...(options.stylesheetHref === undefined ? {} : { stylesheetHref: options.stylesheetHref }),
  });

  const files: EpubPackageFile[] = [
    textFile("mimetype", EPUB_MIMETYPE, EPUB_MIMETYPE),
    textFile(CONTAINER_PATH, "application/xml", containerXml()),
    textFile(PACKAGE_PATH, "application/oebps-package+xml", packageOpf({
      title,
      language,
      identifier,
      ...(options.creator === undefined ? {} : { creator: options.creator }),
      modified,
      pages: xhtml.pages,
    })),
    textFile(NAV_PATH, "application/xhtml+xml", navXhtml(title, language, xhtml.pages)),
    ...xhtml.pages.map((page) => textFile(`OEBPS/${page.href}`, page.mediaType, page.xhtml)),
  ];

  return {
    documentId: document.id,
    files,
    bytes: buildStoredZip(files.map((file) => ({ path: file.path, data: file.data }))),
  };
}
