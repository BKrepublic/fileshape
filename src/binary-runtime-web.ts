import { deflate } from "pako/browser/deflate";
import type { BinaryRuntime } from "./binary-runtime.js";

function hex(bytes: Uint8Array): string {
  let output = "";
  for (const byte of bytes) output += byte.toString(16).padStart(2, "0");
  return output;
}

export const webBinaryRuntime: BinaryRuntime = Object.freeze({
  async sha256Hex(bytes: Uint8Array): Promise<string> {
    if (!globalThis.crypto?.subtle) throw new Error("Web Crypto SHA-256 is unavailable");
    const source = Uint8Array.from(bytes);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", source.buffer);
    return hex(new Uint8Array(digest));
  },

  deflateZlib(bytes: Uint8Array): Uint8Array {
    // FileShape's accepted Node provider delegates to the host node:zlib.
    // Arch/CachyOS Node is built against the shared stock zlib rather than
    // Node's patched bundled zlib. Pako's legacyHash=true selects the stock
    // zlib hash/deflate path, preserving the accepted Node PNG bitstream.
    return deflate(Uint8Array.from(bytes), { legacyHash: true });
  },
});
