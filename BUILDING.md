# Building WaddleVita

You only need this to change the app. Players just install the VPK from the release.

## The Vita app (VPK)
Source: `misc-projects/vita-flash-emulator-main` (a modified RuffleVita with a patched Ruffle core in `emulator/patches/ruffle`).

Docker is the supported way; it contains the vitasdk, vitaGL, the SDL2 Vita fork and cargo-vita:

```
cd misc-projects/vita-flash-emulator-main
docker build -f docker/Dockerfile.psvita --build-arg RUFFLEVITA_FEATURES="" -t rufflevita:psvita .
id=$(docker create rufflevita:psvita)
docker cp $id:/out/rufflevita.vpk WaddleVita.vpk
docker rm $id
```

The first build takes a long time (the Rust standard library and Ruffle are compiled for the Vita); later ones are faster.
App name and id are in `emulator/Cargo.toml` (`[package.metadata.vita]`). The memory the game may use is `NEWLIB_HEAP_SIZE_USER` in `emulator/src/main.rs` (310 MB; 350 MB fails at start).

## Desktop build (for quick testing)
The desktop build runs the same code in a window at the Vita's 960 x 544 and understands a script for automated runs.

- Rust nightly and MSYS2 mingw64 with SDL2 (`pacman -S mingw-w64-x86_64-SDL2`).
- `cargo +nightly build --release --features heapcount` in `emulator/` with `C:\msys64\mingw64\bin` on `PATH`.
- `RUFFLEVITA_SCRIPT="sleep 3000; press R; press Cross; sleep 20000; shot out.png; quit"` drives it (see `src/script.rs`).
- Useful switches: `RUFFLEVITA_LOG=warn,rufflevita=info`, `RUFFLEVITA_FPS=1`, `RUFFLEVITA_DATA=<folder>`.

## The offline pack tool
`tools/offline/build-pack.js` (plain Node, or Waddle Forever's own with `ELECTRON_RUN_AS_NODE=1`; `Build Offline Pack.bat` does that for you) writes `offline.pack`. `media-union.js` is its first step: it builds every supported date on the PC to find the game files in use and to record the file-reference table the Vita uses to start faster. See `OFFLINE.md`.

## The companion (PC)
`tools/wf-companion`: plain Node (no packages). `node companion.js` with Waddle Forever installed
(environment: `WF_APP`, `WF_DATA_DIR`, `COMPANION_PORT`, `COMPANION_TOKEN`). Without Node, `Start WaddleVita Server.bat`
runs it with Waddle Forever's own executable (`ELECTRON_RUN_AS_NODE=1`).
`test-client.js` is a small headless Club Penguin client for testing NPCs and messages against a running companion.

## Making a release
`powershell -File waddlevita/make-release.ps1 -Version 0.1.0 -Vpk <path to the VPK>` builds `release/WaddleVita-<version>.zip`.
