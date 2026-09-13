# FileShape zlib-ng WASM runtime

This directory contains the small FileShape ABI wrapper and the generated
browser artifact used for deterministic EPUB PNG serialization. The runtime
uses the zlib-compatible API from zlib-ng 2.3.3 and reproduces Node v26.7.0's
16 KiB `Z_FINISH` output-window contract. The upstream license is included in
[`LICENSE`](LICENSE).

The source checkout is pinned to zlib-ng commit
`12731092979c6d07f42da27da673a9f6c7b13586`. The build uses the official emsdk
6.0.9 checkout at commit `5eb0bde7585670252e8ba05e9d361627bffd08b5` and
Emscripten 6.0.9 commit `4e4223852a0835923411059a3929907d7df1232e`.

Rebuild the committed artifact with the pinned checkouts:

```sh
vendor/zlib-ng/build-wasm.sh /path/to/zlib-ng-2.3.3 /path/to/emsdk-6.0.9
```

The script verifies both Git checkout commits and the Emscripten version. It
configures zlib-ng with `ZLIB_COMPAT=ON`, `BUILD_SHARED_LIBS=OFF`,
`BUILD_TESTING=OFF`, `WITH_GTEST=OFF`, `WITH_OPTIM=OFF`,
`WITH_NATIVE_INSTRUCTIONS=OFF`, `WITH_RUNTIME_CPU_DETECTION=OFF`,
`WITH_NEW_STRATEGIES=ON`, `WITH_REDUCED_MEM=OFF`, and a Release build. The
link uses `-O3`, standalone WASM, growable non-shared memory, `emmalloc`, no
filesystem, no assertions, and only the four application functions in the
reviewed export list (`malloc`, `free`, `fileshape_zlib_bound`, and
`fileshape_zlib_deflate`).

The generated artifact is committed at
`web/vendor/fileshape-zlib-ng-2.3.3.wasm` and is loaded as a same-origin Vite
asset by the dedicated conversion worker. The hashes below are part of the
artifact provenance and are checked by the local test suite.

`fileshape-zlib-wrapper.c` SHA-256:
`ec5bafe66f5681573efc13d5066e11162427e07d3c32b9a8b72fb53e05c6b126`

`fileshape-zlib-ng-2.3.3.wasm` SHA-256:
`90bc26f8c73322492510a9438e04d41c5ab7badcf76d0ae1e70d1aae4d9176f1`

The build script writes only the requested WASM artifact. Ordinary dependency
installation, browser builds, and tests consume the committed artifact and do
not download or compile native code.
