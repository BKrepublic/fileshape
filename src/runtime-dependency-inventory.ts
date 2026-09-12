import { readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  createScanner,
  LanguageVariant,
  ScriptTarget,
  SyntaxKind,
} from "typescript/unstable/ast";

const ROOT = path.resolve(".");
const ARTIFACT = path.join(ROOT, "docs/stage27-runtime-dependency-inventory.json");
const ENTRYPOINTS = ["src/pdf-inspector-core.ts", "src/pdf-to-epub-core.ts"] as const;
const PROVIDER = "src/pdf-inspector.ts" as const;
const TOOLING = ["src/epubcheck.ts", "src/setup-epubcheck.ts"] as const;
const ABSENT_BROWSER_CONTRACTS = [
  "worker-ownership", "progress", "cancellation", "diagnostics",
  "file-size-memory-policy", "download-save", "resource-cleanup",
] as const;

export type RuntimeDependencyInventory = {
  schemaVersion: 1;
  entrypoints: Array<{
    path: (typeof ENTRYPOINTS)[number];
    directNodeBuiltins: string[];
    transitiveNodeBuiltins: string[];
    externalPackages: string[];
    reachableLocalModules: string[];
  }>;
  nodeAdapterProviders: [{
    path: typeof PROVIDER;
    exportName: "nodePdfJsResourceConfig";
    directNodeBuiltins: string[];
    configKeys: ["cMapPacked", "cMapUrl", "disableFontFace", "standardFontDataUrl", "useSystemFonts"];
  }];
  unreachableValidationTooling: [typeof TOOLING[0], typeof TOOLING[1]];
  absentBrowserContracts: [
    "worker-ownership", "progress", "cancellation", "diagnostics",
    "file-size-memory-policy", "download-save", "resource-cleanup",
  ];
};

type Edge = { specifier: string; target?: string; kind: "local" | "node" | "external" };
type ModuleInfo = { path: string; edges: Edge[] };

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function repositoryPath(value: string): string {
  return value.split(path.sep).join("/");
}

function readSource(relativePath: string): string {
  try {
    return readFileSync(path.join(ROOT, relativePath), "utf8");
  } catch {
    throw new Error(`cannot read source module ${relativePath}`);
  }
}

function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
}

function resolveLocal(from: string, specifier: string): string {
  const withoutExtension = specifier.replace(/\.(?:js|mjs|cjs)$/u, "");
  const base = path.normalize(path.join(path.dirname(from), withoutExtension));
  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")];
  for (const candidate of candidates) {
    const relative = repositoryPath(path.relative(ROOT, path.join(ROOT, candidate)));
    if (!relative.startsWith("..")) {
      try { readFileSync(path.join(ROOT, relative)); return relative; } catch { /* continue */ }
    }
  }
  throw new Error(`unresolved relative runtime import ${from} -> ${specifier}`);
}

function scanRuntimeSpecifiers(relativePath: string, text: string): string[] {
  const scanner = createScanner(true, LanguageVariant.Standard, text);
  const output: string[] = [];
  let token = scanner.scan();
  while (token !== SyntaxKind.EndOfFile) {
    if (token === SyntaxKind.ImportKeyword || token === SyntaxKind.ExportKeyword) {
      const declarationKind = token;
      const declarationStart = scanner.getTokenStart();
      let next = scanner.scan();
      if (declarationKind === SyntaxKind.ImportKeyword && next === SyntaxKind.OpenParenToken) {
        throw new Error(`unsupported dynamic import in ${relativePath}`);
      }
      if (declarationKind === SyntaxKind.ExportKeyword && next !== SyntaxKind.OpenBraceToken &&
        next !== SyntaxKind.AsteriskToken && next !== SyntaxKind.TypeKeyword) {
        do next = scanner.scan();
        while (next !== SyntaxKind.EndOfFile && next !== SyntaxKind.SemicolonToken);
        token = scanner.scan();
        continue;
      }
      const typeOnly = next === SyntaxKind.TypeKeyword;
      if (typeOnly) {
        do next = scanner.scan();
        while (next !== SyntaxKind.EndOfFile && next !== SyntaxKind.SemicolonToken);
        token = scanner.scan();
        continue;
      }
      if (next === SyntaxKind.StringLiteral) {
        if (!typeOnly) output.push(scanner.getTokenValue());
      } else {
        let braceDepth = 0;
        let runtimeBinding: boolean = declarationKind === SyntaxKind.ImportKeyword && next !== SyntaxKind.OpenBraceToken;
        let previousWasType: boolean = typeOnly;
        for (;;) {
          if (next === SyntaxKind.EndOfFile || next === SyntaxKind.SemicolonToken ||
            scanner.hasPrecedingLineBreak() && braceDepth === 0) break;
          if (next === SyntaxKind.OpenBraceToken) braceDepth += 1;
          if (next === SyntaxKind.CloseBraceToken) braceDepth = Math.max(0, braceDepth - 1);
          if ((declarationKind === SyntaxKind.ImportKeyword || declarationKind === SyntaxKind.ExportKeyword) &&
            next === SyntaxKind.EqualsToken) {
            throw new Error(`unsupported import/export equals edge in ${relativePath}`);
          }
          if (next === SyntaxKind.Identifier && scanner.getTokenValue() === "require" &&
            scanner.lookAhead(() => scanner.scan()) === SyntaxKind.OpenParenToken) {
            throw new Error(`unsupported import-equals or require edge in ${relativePath}`);
          }
          if (braceDepth > 0 && next === SyntaxKind.TypeKeyword) previousWasType = true;
          else if (braceDepth > 0 && next === SyntaxKind.Identifier) {
            if (!previousWasType) runtimeBinding = true;
            previousWasType = false;
          }
          if (next === SyntaxKind.FromKeyword && braceDepth === 0) {
            next = scanner.scan();
            if (next !== SyntaxKind.StringLiteral) throw new Error(`nonliteral module edge in ${relativePath}`);
            if (!typeOnly && runtimeBinding) output.push(scanner.getTokenValue());
            break;
          }
          next = scanner.scan();
        }
      }
      token = scanner.scan();
      continue;
    }
    if (token === SyntaxKind.Identifier && scanner.getTokenValue() === "require") {
      const next = scanner.lookAhead(() => scanner.scan());
      if (next === SyntaxKind.OpenParenToken) throw new Error(`unsupported require edge in ${relativePath}`);
    }
    token = scanner.scan();
  }
  return output;
}

function collectModule(relativePath: string): ModuleInfo {
  const edges: Edge[] = [];
  for (const specifier of scanRuntimeSpecifiers(relativePath, readSource(relativePath))) {
    if (specifier.startsWith("node:")) edges.push({ specifier, kind: "node" });
    else if (specifier.startsWith(".")) edges.push({ specifier, target: resolveLocal(relativePath, specifier), kind: "local" });
    else edges.push({ specifier, kind: "external" });
  }
  return { path: relativePath, edges };
}

function graphFrom(entrypoint: string): Map<string, ModuleInfo> {
  const graph = new Map<string, ModuleInfo>();
  const pending = [entrypoint];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (graph.has(current)) continue;
    const info = collectModule(current);
    graph.set(current, info);
    for (const edge of info.edges) if (edge.kind === "local") pending.push(edge.target!);
  }
  return graph;
}

function nodeBuiltins(graph: Map<string, ModuleInfo>): { direct: string[]; transitive: string[] } {
  const entry = graph.values().next().value as ModuleInfo;
  const direct = sorted(entry.edges.filter((edge) => edge.kind === "node").map((edge) => edge.specifier));
  const all = sorted([...graph.values()].flatMap((info) => info.edges
    .filter((edge) => edge.kind === "node").map((edge) => edge.specifier)));
  return { direct, transitive: all };
}

function verifyProvider(): string[] {
  const text = readSource(PROVIDER);
  const directNodeBuiltins = scanRuntimeSpecifiers(PROVIDER, text).filter((specifier) => specifier.startsWith("node:"));
  const provider = /export\s+const\s+nodePdfJsResourceConfig\s*:\s*PdfJsResourceConfig\s*=\s*\{([\s\S]*?)\n\};/u.exec(text)?.[1];
  if (provider === undefined) throw new Error(`${PROVIDER} must export nodePdfJsResourceConfig`);
  const keys = [...provider.matchAll(/^\s*([A-Za-z][A-Za-z0-9]*)(?=\s*(?::|,|$))/gmu)].map((match) => match[1]!);
  const expected = ["cMapPacked", "cMapUrl", "disableFontFace", "standardFontDataUrl", "useSystemFonts"];
  if (JSON.stringify(sorted(keys)) !== JSON.stringify(expected)) throw new Error(`${PROVIDER} provider keys do not match contract`);
  return sorted(directNodeBuiltins);
}

function verifyDelegation(): void {
  const text = readSource("src/pdf-to-epub.ts");
  if (!/import\s*\{[^}]*\bnodePdfJsResourceConfig\b[^}]*\}\s*from\s*["']\.\/pdf-inspector\.js["']/su.test(text)) {
    throw new Error("pdf-to-epub.ts must import nodePdfJsResourceConfig");
  }
  if (!/convertPdfBytesToEpubWithResources\([^)]*nodePdfJsResourceConfig/su.test(text)) {
    throw new Error("pdf-to-epub.ts must delegate with nodePdfJsResourceConfig");
  }
}

export function generateRuntimeDependencyInventory(): RuntimeDependencyInventory {
  const graphs = ENTRYPOINTS.map((entrypoint) => graphFrom(entrypoint));
  const entrypoints = graphs.map((graph, index) => {
    const entrypoint = ENTRYPOINTS[index]!;
    const { direct, transitive } = nodeBuiltins(graph);
    return {
      path: entrypoint,
      directNodeBuiltins: direct,
      transitiveNodeBuiltins: transitive,
      externalPackages: sorted([...graph.values()].flatMap((info) => info.edges
        .filter((edge) => edge.kind === "external").map((edge) => packageName(edge.specifier)))),
      reachableLocalModules: sorted(graph.keys()),
    };
  });
  const reachable = new Set(entrypoints.flatMap((entrypoint) => entrypoint.reachableLocalModules));
  for (const file of TOOLING) if (reachable.has(file)) throw new Error(`${file} is reachable validation tooling`);
  verifyDelegation();
  return {
    schemaVersion: 1,
    entrypoints,
    nodeAdapterProviders: [{
      path: PROVIDER,
      exportName: "nodePdfJsResourceConfig",
      directNodeBuiltins: verifyProvider(),
      configKeys: ["cMapPacked", "cMapUrl", "disableFontFace", "standardFontDataUrl", "useSystemFonts"],
    }],
    unreachableValidationTooling: [...TOOLING],
    absentBrowserContracts: [...ABSENT_BROWSER_CONTRACTS],
  };
}

export function serializedInventory(inventory = generateRuntimeDependencyInventory()): string {
  return `${JSON.stringify(inventory, null, 2)}\n`;
}

async function main(): Promise<void> {
  const serialized = serializedInventory();
  if (process.argv.includes("--write")) await writeFile(ARTIFACT, serialized, "utf8");
  else if (process.argv.includes("--verify")) {
    const actual = await readFile(ARTIFACT, "utf8");
    if (actual !== serialized) throw new Error(`${ARTIFACT} differs from generated inventory`);
  } else process.stdout.write(serialized);
}

if (path.resolve(process.argv[1] ?? "") === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
