const UINT32_MAX = 0xffff_ffff;

type ZlibExports = {
  memory: WebAssembly.Memory;
  malloc: (size: number) => number;
  free: (pointer: number) => void;
  fileshape_zlib_bound: (sourceLength: number) => number;
  fileshape_zlib_deflate: (
    source: number,
    sourceLength: number,
    destination: number,
    destinationCapacity: number,
    destinationLength: number,
  ) => number;
};

function requiredExport<T extends WebAssembly.ExportValue>(
  exports: WebAssembly.Exports,
  name: string,
  predicate: (value: WebAssembly.ExportValue | undefined) => value is T,
): T {
  const value = exports[name];
  if (!predicate(value)) throw new Error(`zlib-ng WASM export is invalid: ${name}`);
  return value;
}

type WasmFunction = (...args: number[]) => number;

function isFunction(value: WebAssembly.ExportValue | undefined): value is WasmFunction {
  return typeof value === "function";
}

function isMemory(value: WebAssembly.ExportValue | undefined): value is WebAssembly.Memory {
  return value instanceof WebAssembly.Memory;
}

function asPointer(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0 || value > UINT32_MAX) {
    throw new Error(`zlib-ng WASM ${name} allocation failed`);
  }
  return value;
}

export type ZlibWasmDeflater = (bytes: Uint8Array) => Uint8Array;

export function createZlibWasmDeflater(instance: WebAssembly.Instance): ZlibWasmDeflater {
  const wasm = instance.exports;
  const exports: ZlibExports = {
    memory: requiredExport(wasm, "memory", isMemory),
    malloc: requiredExport(wasm, "malloc", isFunction) as ZlibExports["malloc"],
    free: requiredExport(wasm, "free", isFunction) as ZlibExports["free"],
    fileshape_zlib_bound: requiredExport(wasm, "fileshape_zlib_bound", isFunction) as ZlibExports["fileshape_zlib_bound"],
    fileshape_zlib_deflate: requiredExport(wasm, "fileshape_zlib_deflate", isFunction) as ZlibExports["fileshape_zlib_deflate"],
  };
  const initialize = wasm._initialize;
  if (initialize !== undefined) {
    if (!isFunction(initialize)) throw new Error("zlib-ng WASM _initialize export is invalid");
    initialize();
  }

  return (bytes: Uint8Array): Uint8Array => {
    if (bytes.byteLength > UINT32_MAX) throw new Error("zlib-ng WASM input is larger than uint32");
    const sourceLength = bytes.byteLength >>> 0;
    const destinationCapacity = exports.fileshape_zlib_bound(sourceLength) >>> 0;
    if (destinationCapacity === 0) throw new Error("zlib-ng WASM returned an invalid output bound");

    let source = 0;
    let destination = 0;
    let destinationLength = 0;
    try {
      source = asPointer(exports.malloc(Math.max(1, sourceLength)), "input");
      destination = asPointer(exports.malloc(destinationCapacity), "output");
      destinationLength = asPointer(exports.malloc(4), "length");

      // No await is permitted between this copy, the native call, and cleanup:
      // the instance owns one non-threaded memory and this section is synchronous.
      new Uint8Array(exports.memory.buffer, source, sourceLength).set(bytes);
      const status = exports.fileshape_zlib_deflate(
        source,
        sourceLength,
        destination,
        destinationCapacity,
        destinationLength,
      );
      const length = new DataView(exports.memory.buffer).getUint32(destinationLength, true);
      if (status !== 0) throw new Error(`zlib-ng WASM deflate failed with status ${status}`);
      if (length > destinationCapacity) throw new Error("zlib-ng WASM returned an invalid output length");
      return Uint8Array.from(new Uint8Array(exports.memory.buffer, destination, length));
    } finally {
      if (destinationLength !== 0) exports.free(destinationLength);
      if (destination !== 0) exports.free(destination);
      if (source !== 0) exports.free(source);
    }
  };
}

export async function instantiateZlibWasm(source: BufferSource): Promise<ZlibWasmDeflater> {
  const module = await WebAssembly.compile(source);
  const instance = await WebAssembly.instantiate(module, {
    env: { emscripten_notify_memory_growth() {} },
  });
  return createZlibWasmDeflater(instance);
}
