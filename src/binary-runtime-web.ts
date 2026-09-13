import { assertSha256Hex, type BinaryRuntime } from "./binary-runtime.js";

function hex(bytes: Uint8Array): string {
  let output = "";
  for (const byte of bytes) output += byte.toString(16).padStart(2, "0");
  return output;
}

export function createWebBinaryRuntime(
  deflateZlib: BinaryRuntime["deflateZlib"],
): BinaryRuntime {
  return Object.freeze({
    async sha256Hex(bytes: Uint8Array): Promise<string> {
    if (!globalThis.crypto?.subtle) throw new Error("Web Crypto SHA-256 is unavailable");
    const source = Uint8Array.from(bytes);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", source.buffer);
    return assertSha256Hex(hex(new Uint8Array(digest)));
    },

    deflateZlib,
  });
}
