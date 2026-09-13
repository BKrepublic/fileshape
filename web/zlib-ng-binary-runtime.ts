import wasmUrl from "./vendor/fileshape-zlib-ng-2.3.3.wasm?url";
import { createWebBinaryRuntime } from "../src/binary-runtime-web.js";
import { instantiateZlibWasm } from "../src/zlib-wasm-adapter.js";

function wasmAssetUrl(): URL {
  const url = new URL(wasmUrl, self.location.href);
  if (url.origin !== self.location.origin) throw new Error("zlib-ng WASM escaped the application origin");
  return url;
}

const zlibWasm = fetch(wasmAssetUrl()).then(async (response) => {
  if (!response.ok) throw new Error(`zlib-ng WASM request failed: ${response.status}`);
  return instantiateZlibWasm(await response.arrayBuffer());
});

export const webBinaryRuntime = createWebBinaryRuntime(async (bytes) => {
  const deflate = await zlibWasm;
  return deflate(Uint8Array.from(bytes));
});

export const webZlibWasmReady = zlibWasm.then(() => undefined);
