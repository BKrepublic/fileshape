import { createHash } from "node:crypto";

const decoder = new TextDecoder();
const IMAGE_PATH = /^OEBPS\/images\/([0-9a-f]{64})\.png$/;
const IMAGE_HREF = /^images\/([0-9a-f]{64})\.png$/;
const XHTML_IMAGE_SRC = /^\.\.\/images\/([0-9a-f]{64})\.png$/;

type ArchiveEntry = {
  path: string;
  method: number;
  data: Uint8Array;
};

export type EpubImagePackageValidation = {
  issues: string[];
  occurrenceCount: number;
  resourceCount: number;
  resourceHashes: string[];
  coverImageHashes: string[];
};

function localEntries(bytes: Uint8Array): ArchiveEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries: ArchiveEntry[] = [];
  let offset = 0;
  while (offset + 30 <= bytes.byteLength && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.byteLength) throw new Error("ZIP local entry exceeds archive length");
    entries.push({
      path: decoder.decode(bytes.subarray(nameStart, nameStart + nameLength)),
      method,
      data: bytes.subarray(dataStart, dataEnd),
    });
    offset = dataEnd;
  }
  return entries;
}

function attributes(tag: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const match of tag.matchAll(/([A-Za-z_:][A-Za-z0-9_.:-]*)="([^"]*)"/g)) {
    result.set(match[1]!, match[2]!);
  }
  return result;
}

function sameSet(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) if (!right.has(value)) return false;
  return true;
}

export function validateEpubImagePackage(bytes: Uint8Array): EpubImagePackageValidation {
  const issues: string[] = [];
  let entries: ArchiveEntry[];
  try {
    entries = localEntries(bytes);
  } catch (error) {
    return {
      issues: [error instanceof Error ? error.message : String(error)],
      occurrenceCount: 0,
      resourceCount: 0,
      resourceHashes: [],
      coverImageHashes: [],
    };
  }

  const byPath = new Map<string, ArchiveEntry>();
  for (const entry of entries) {
    if (byPath.has(entry.path)) issues.push(`duplicate ZIP entry ${entry.path}`);
    byPath.set(entry.path, entry);
  }

  const referencedHashes = new Set<string>();
  let occurrenceCount = 0;
  for (const entry of entries.filter((candidate) => /^OEBPS\/text\/page-\d+\.xhtml$/.test(candidate.path))) {
    if (entry.method !== 0) {
      issues.push(`${entry.path} is compressed; image verifier expects stored XHTML entries`);
      continue;
    }
    const xhtml = decoder.decode(entry.data);
    const figureCount = (xhtml.match(/class="[^"]*\bfileshape-image\b[^"]*"/g) ?? []).length;
    let imageCount = 0;
    for (const match of xhtml.matchAll(/<img\b[^>]*>/g)) {
      const attrs = attributes(match[0]);
      const src = attrs.get("src");
      if (!src) {
        issues.push(`${entry.path} image is missing src`);
        continue;
      }
      const parsed = XHTML_IMAGE_SRC.exec(src);
      if (!parsed) {
        issues.push(`${entry.path} has unsupported image src ${src}`);
        continue;
      }
      referencedHashes.add(parsed[1]!);
      imageCount += 1;
      occurrenceCount += 1;
    }
    if (figureCount !== imageCount) {
      issues.push(`${entry.path} has ${figureCount} fileshape image figures but ${imageCount} valid image references`);
    }
  }

  const manifestHashes = new Set<string>();
  const coverImageHashes = new Set<string>();
  const opf = byPath.get("OEBPS/package.opf");
  if (!opf) {
    issues.push("missing OEBPS/package.opf for image validation");
  } else if (opf.method !== 0) {
    issues.push("OEBPS/package.opf is compressed; image verifier expects stored OPF entry");
  } else {
    const text = decoder.decode(opf.data);
    for (const match of text.matchAll(/<item\b[^>]*\/>/g)) {
      const attrs = attributes(match[0]);
      if (attrs.get("media-type") !== "image/png") continue;
      const href = attrs.get("href");
      const id = attrs.get("id");
      if (!href) {
        issues.push("image manifest item is missing href");
        continue;
      }
      const parsed = IMAGE_HREF.exec(href);
      if (!parsed) {
        issues.push(`image manifest href is not content-hash PNG path: ${href}`);
        continue;
      }
      const hash = parsed[1]!;
      if (id !== `image-${hash}`) issues.push(`image manifest id does not match href hash: ${id ?? "<missing>"}`);
      if (manifestHashes.has(hash)) issues.push(`duplicate image manifest resource ${hash}`);
      manifestHashes.add(hash);
      const properties = (attrs.get("properties") ?? "").split(/\s+/).filter(Boolean);
      if (properties.includes("cover-image")) coverImageHashes.add(hash);
    }
  }
  if (coverImageHashes.size > 1) {
    issues.push(`EPUB package has ${coverImageHashes.size} cover-image resources; expected at most one`);
  }

  const archiveHashes = new Set<string>();
  for (const entry of entries) {
    const parsed = IMAGE_PATH.exec(entry.path);
    if (!parsed) continue;
    const hash = parsed[1]!;
    if (entry.method !== 0) issues.push(`${entry.path} is compressed; FileShape image resources must be stored`);
    const actual = createHash("sha256").update(entry.data).digest("hex");
    if (actual !== hash) issues.push(`${entry.path} bytes do not match content hash`);
    if (archiveHashes.has(hash)) issues.push(`duplicate image archive resource ${hash}`);
    archiveHashes.add(hash);
  }

  if (!sameSet(referencedHashes, manifestHashes)) {
    issues.push(`XHTML image references and OPF image manifest differ (${referencedHashes.size} referenced, ${manifestHashes.size} manifest)`);
  }
  if (!sameSet(manifestHashes, archiveHashes)) {
    issues.push(`OPF image manifest and ZIP image resources differ (${manifestHashes.size} manifest, ${archiveHashes.size} ZIP)`);
  }

  return {
    issues,
    occurrenceCount,
    resourceCount: archiveHashes.size,
    resourceHashes: [...archiveHashes].sort(),
    coverImageHashes: [...coverImageHashes].sort(),
  };
}
