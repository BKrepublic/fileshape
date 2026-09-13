#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 || $# -gt 3 ]]; then
  printf 'usage: %s ZLIB_NG_CHECKOUT EMSDK_CHECKOUT [OUTPUT_WASM]\n' "$0" >&2
  exit 2
fi

zlib_checkout=$1
emsdk_checkout=$2
script_dir=$(cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(cd -- "$script_dir/../.." && pwd)
output=${3:-"$repo_root/web/vendor/fileshape-zlib-ng-2.3.3.wasm"}

readonly expected_zlib_commit=12731092979c6d07f42da27da673a9f6c7b13586
readonly expected_emsdk_commit=5eb0bde7585670252e8ba05e9d361627bffd08b5
readonly expected_emscripten_commit=4e4223852a0835923411059a3929907d7df1232e

[[ -d "$zlib_checkout/.git" ]] || { printf 'zlib-ng checkout is not a git repository: %s\n' "$zlib_checkout" >&2; exit 1; }
[[ -d "$emsdk_checkout/.git" ]] || { printf 'emsdk checkout is not a git repository: %s\n' "$emsdk_checkout" >&2; exit 1; }
[[ $(git -C "$zlib_checkout" rev-parse HEAD) == "$expected_zlib_commit" ]] || {
  printf 'unexpected zlib-ng commit\n' >&2
  exit 1
}
[[ $(git -C "$emsdk_checkout" rev-parse HEAD) == "$expected_emsdk_commit" ]] || {
  printf 'unexpected emsdk commit\n' >&2
  exit 1
}

source "$emsdk_checkout/emsdk_env.sh"
emcc_version=$(emcc --version | sed -n '1p')
[[ "$emcc_version" == *"6.0.9 ($expected_emscripten_commit)"* ]] || {
  printf 'unexpected Emscripten version: %s\n' "$emcc_version" >&2
  exit 1
}

build_dir=$(mktemp -d /tmp/fileshape-zlib-ng-wasm.XXXXXX)
trap 'rm -rf "$build_dir"' EXIT

emcmake cmake -S "$zlib_checkout" -B "$build_dir" \
  -DZLIB_COMPAT=ON \
  -DBUILD_SHARED_LIBS=OFF \
  -DBUILD_TESTING=OFF \
  -DWITH_GTEST=OFF \
  -DWITH_OPTIM=OFF \
  -DWITH_NATIVE_INSTRUCTIONS=OFF \
  -DWITH_RUNTIME_CPU_DETECTION=OFF \
  -DWITH_NEW_STRATEGIES=ON \
  -DWITH_REDUCED_MEM=OFF \
  -DCMAKE_BUILD_TYPE=Release
cmake --build "$build_dir" --parallel "${CMAKE_BUILD_PARALLEL_LEVEL:-4}"

mkdir -p "$(dirname -- "$output")"
emcc "$script_dir/fileshape-zlib-wrapper.c" "$build_dir/libz.a" \
  -I"$build_dir" \
  -O3 \
  --no-entry \
  -sSTANDALONE_WASM=1 \
  -sALLOW_MEMORY_GROWTH=1 \
  -sFILESYSTEM=0 \
  -sMALLOC=emmalloc \
  -sASSERTIONS=0 \
  -sERROR_ON_UNDEFINED_SYMBOLS=1 \
  -sEXPORTED_FUNCTIONS='["_malloc","_free","_fileshape_zlib_bound","_fileshape_zlib_deflate"]' \
  -o "$output"

[[ -s "$output" ]] || { printf 'Emscripten produced an empty artifact: %s\n' "$output" >&2; exit 1; }
chmod 0644 "$output"
artifact_hash=$(sha256sum "$output" | awk '{print $1}')
recorded_hash=$(awk '/`fileshape-zlib-ng-2\.3\.3\.wasm` SHA-256:/{getline; gsub(/`/, ""); print}' "$script_dir/README.md")
if [[ -n "$recorded_hash" && "$artifact_hash" != "$recorded_hash" ]]; then
  printf 'generated WASM hash differs from vendor/zlib-ng/README.md\n' >&2
  printf 'expected: %s\nactual:   %s\n' "$recorded_hash" "$artifact_hash" >&2
  exit 1
fi
printf 'built %s (%s bytes, sha256 %s)\n' "$output" "$(wc -c < "$output")" "$artifact_hash"
