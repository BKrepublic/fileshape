import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("dist/browser");
const text = async (relative: string): Promise<string> => readFile(path.join(root, relative), "utf8");
const sourceText = async (relative: string): Promise<string> => readFile(path.resolve(relative), "utf8");
const requireMatch = (value: string, pattern: RegExp, message: string): void => {
  if (!pattern.test(value)) throw new Error(message);
};
const requireFile = async (relative: string): Promise<Buffer> => readFile(path.join(root, relative));

async function listFiles(directory: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await listFiles(path.join(directory, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

function pngDimensions(bytes: Buffer): { width: number; height: number } {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!bytes.subarray(0, 8).equals(signature) || bytes.toString("ascii", 12, 16) !== "IHDR") throw new Error("icon is not a PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function main(): Promise<void> {
  const html = await text("index.html");
  const manifest = JSON.parse(await text("app.webmanifest")) as Record<string, unknown>;
  const serviceWorker = await text("service-worker.js");
  requireMatch(html, /rel="manifest" href="\.\/app\.webmanifest"/, "built HTML must link a relative manifest");
  requireMatch(html, /<script\b[^>]*\btype="module"[^>]*\bsrc="\.\/assets\//, "built HTML must link a relative module asset");
  requireMatch(html, /Content-Security-Policy/, "built HTML must contain CSP");
  if (manifest.id !== "./" || manifest.start_url !== "." || manifest.scope !== "." || manifest.display !== "standalone") throw new Error("manifest identity/scope/display is invalid");
  if (!Array.isArray(manifest.icons) || manifest.icons.length !== 2) throw new Error("manifest must contain two icons");
  const iconSizes = ["192x192", "512x512"];
  for (const [index, expectedSize] of iconSizes.entries()) {
    const icon = manifest.icons[index] as Record<string, unknown> | undefined;
    if (!icon || icon.sizes !== expectedSize || icon.type !== "image/png") throw new Error(`manifest icon ${expectedSize} is invalid`);
    const relative = String(icon.src).replace(/^\.\//, "");
    const dimensions = pngDimensions(await requireFile(relative));
    if (`${dimensions.width}x${dimensions.height}` !== expectedSize) throw new Error(`icon ${relative} dimensions are invalid`);
  }
  requireMatch(serviceWorker, /fileshape-shell-v1/, "service worker cache version is missing");
  requireMatch(serviceWorker, /request\.mode === "navigate"/, "service worker must provide navigation fallback");
  requireMatch(serviceWorker, /url\.origin !== self\.location\.origin/, "service worker must restrict cache requests to same origin");
  requireMatch(serviceWorker, /self\.registration\.scope/, "service worker must use application scope");

  for (const relative of [
    "pdfjs/cmaps/Adobe-Japan1-UCS2.bcmap",
    "pdfjs/standard_fonts/FoxitSymbol.pfb",
    "pdfjs/wasm/qcms_bg.wasm",
    "pdfjs/iccs/CGATS001Compat-v2-micro.icc",
  ]) {
    const resource = await requireFile(relative);
    if (resource.byteLength === 0) throw new Error(`PDF.js browser resource is empty: ${relative}`);
  }

  const allBuiltFiles = await listFiles(root);
  const javascriptFiles = allBuiltFiles.filter((file) => file.endsWith(".js"));
  if (javascriptFiles.length < 3) throw new Error("browser build did not emit the application and worker JavaScript assets");
  const javascript = await Promise.all(javascriptFiles.map((file) => text(file)));
  const emitted = javascript.join("\n");
  if (/(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\()\s*["']node:/.test(emitted) || /__vite-browser-external/.test(emitted)) {
    throw new Error("browser application/worker bundle contains a Node import or browser shim");
  }
  const browserSources = (await Promise.all([
    "web/main.ts",
    "web/pdfjs-runtime-probe.ts",
    "web/binary-runtime-probe.ts",
    "web/pdfjs-resource-config.ts",
    "web/conversion-worker.ts",
  ].map(sourceText))).join("\n");
  if (/https?:\/\//.test(browserSources)) throw new Error("browser application source contains an HTTP(S) runtime URL");
  requireMatch(browserSources, /isOffscreenCanvasSupported:\s*false/, "browser PDF.js config must keep OffscreenCanvas image conversion disabled for Node parity");
  requireMatch(browserSources, /isImageDecoderSupported:\s*false/, "browser PDF.js config must keep ImageDecoder disabled for Node parity");
  requireMatch(emitted, /PDFWorker/, "PDF.js browser worker code was not emitted");
  requireMatch(emitted, /CompressionStream/, "browser binary runtime was not emitted");
  requireMatch(emitted, /PDF input must not be empty/, "dedicated conversion worker did not include the accepted conversion core");
  requireMatch(emitted, /serializing-epub/, "dedicated conversion worker did not include conversion progress phases");
  const cssAsset = (html.match(/\.\/assets\/[^"']+\.css/) ?? [""])[0].replace(/^\.\/assets\//, "");
  if (cssAsset.length === 0) throw new Error("no emitted CSS asset found");
  const css = await text(`assets/${cssAsset}`);
  requireMatch(css, /min-width:\s*600px/, "CSS must define the 600px layout transition");
  requireMatch(css, /min-height:\s*48px/, "CSS must define 48px interactive controls");
  requireMatch(css, /prefers-reduced-motion/, "CSS must honor reduced motion");
  requireMatch(css, /prefers-color-scheme:\s*dark/, "CSS must include dark system tokens");
  requireMatch(css, /:focus-visible/, "CSS must include visible keyboard focus");
  console.log("FILESHAPE BROWSER STATIC RESULT: PASS");
}

await main();
