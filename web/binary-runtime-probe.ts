import { webBinaryRuntime } from "../src/binary-runtime-web.js";

export type BinaryRuntimeProbeResult = {
  state: "supported" | "unsupported";
  message: string;
};

const FIXTURE = new TextEncoder().encode("FileShape browser binary runtime");
const EXPECTED_SHA256 = "908d1c0d2c8177688dba0e2a60927cb96fef1ddc2af5220c565e013b78d4b7b6";
const EXPECTED_DEFLATE = "789c73cbcc490dce482c4855482aca2f2f4e2d5248cacc4b2caa54282acd2bc9cc4d0500c7f50c5f";

function hex(bytes: Uint8Array): string {
  let output = "";
  for (const byte of bytes) output += byte.toString(16).padStart(2, "0");
  return output;
}

export async function probeBinaryRuntime(): Promise<BinaryRuntimeProbeResult> {
  try {
    const sha256 = await webBinaryRuntime.sha256Hex(FIXTURE);
    if (sha256 !== EXPECTED_SHA256) {
      return { state: "unsupported", message: "Web Crypto SHA-256 が受理済みバイト列と一致しません。" };
    }
    const compressed = await webBinaryRuntime.deflateZlib(FIXTURE);
    if (hex(compressed) !== EXPECTED_DEFLATE) {
      return { state: "unsupported", message: "ブラウザzlib実装が受理済みNodeバイト列と一致しません。" };
    }
    return { state: "supported", message: "Web Crypto SHA-256 とNode互換zlib deflateを確認しました。" };
  } catch (error) {
    return {
      state: "unsupported",
      message: error instanceof Error ? error.message : "ブラウザ向けbinary runtimeを確認できませんでした。",
    };
  }
}
