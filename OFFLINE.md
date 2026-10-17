# Offline mode: Club Penguin on the Vita with no PC

WaddleVita can run Waddle Forever's own server **inside the Vita app**, so you can play with nothing else switched on. It is the same
server code as on the PC (the island of the date you pick, the same penguin data format), run by an embedded JavaScript engine
(QuickJS). The game's web requests and game connections never leave the app.

> The game files are still not part of this project. You make the **offline pack** yourself, on a PC, from your own Waddle Forever install.

## What you need

- Everything for normal WaddleVita (see the README), plus **about 1.4 GB free** on the Vita's memory card for the pack.
- A PC with **Waddle Forever installed and started once** (so it has downloaded its game files) and **Node.js 18+** (Waddle Forever's own Node is not used by the pack tool).

## 1. Make the pack (on the PC)

```bash
node tools/offline/build-pack.js --out offline-pack
```

(The release package has it in `Offline/`.) It finds Waddle Forever the way the server script does; use `--wf "<folder>"` if yours is somewhere else.
It takes about three minutes and writes:

| File | |
| --- | --- |
| `offline-pack/offline.pack` | one 1.3 GB file: Waddle Forever's server code plus every game file the supported dates (2005-08-22 to 2011-06-26) can reach |
| `offline-pack/offline.pack.sha256` | the checksum, to check the copy |

Why one file: the Vita refuses files more than nine folders deep, and VitaShell loses files when it copies thousands of them. One big file copied once survives.

## 2. Copy it to the Vita

Put **`offline.pack`** in **`ux0:data/WaddleVita/offline/`** (make the folder if it is not there). Use USB (VitaShell, "USB" mode), FTP (VitaShell) or any copier you trust.
Check the copy against `offline.pack.sha256` if you can (the file size must be exactly the same as on the PC).

## 3. Play

1. Open WaddleVita, go to the **Server** tab (**R** from the library).
2. Press **Square** until the address box shows **offline** (Square goes through the servers found on your network first, then offline). The text under the box confirms: "Offline: the game runs on this Vita".
3. Press **Cross** on Play.

The first time the server has to prepare itself and a few of the game's files: the loading screen shows the steps and a clock. **Measured on a Vita:** the server was ready after 52 s, and the game then waited about 24 s each for its two big generated files (about 100 s in all before the login screen). Those files are kept on the card, so later starts should skip that part (not yet measured). After that:

- the app remembers your choice and starts the server as soon as you open it, while you are still in the menus, so it is usually well on its way by the time you press Play;
- the files it builds are kept on the card (`ux0:data/WaddleVita/offline/home/cache`), so later starts should be quicker;
- changing the date in the **Waddle Forever** page of the pause menu rebuilds the day's data (about a minute on a Vita), then reloads the game.

Your penguin, items and friends live in `ux0:data/WaddleVita/offline/home/.waddleforever` on the Vita. They are separate from the PC's Waddle Forever and from other servers.
Back that folder up if you care about it.

### What works offline and what does not

| | Offline |
| --- | --- |
| Rooms, minigames, music, parties for 2005-08-22 to 2011-06-26 | Yes |
| Your penguin, items, coins, igloo, stamps | Yes, saved on the Vita |
| Waddle Forever menu (timeline date, settings, mods, reset) | Yes |
| Other players | No (it is a single-player island) |
| Admin page, NPC penguins, mascots, tour guide, admin messages | No (these need the PC server) |
| The big client (2011-06-27 onward) | No (it does not fit the Vita's memory, offline or not) |

While offline mode is running the app keeps about 20 MB more in memory. Starting a game from the library stops the offline server first so those games get all of it.

## Troubleshooting

| Problem | Try |
| --- | --- |
| "The offline pack isn't on this Vita yet" | The file must be exactly `ux0:data/WaddleVita/offline/offline.pack`. |
| "The offline server didn't start: ..." | Send `ux0:data/WaddleVita/log.txt`. A wrong or incomplete copy of the pack is the usual reason: compare its size with the PC's. |
| It stays on "Reading the timeline" for minutes | The first start is slow (see below); wait. If it is still there after ten minutes, send the log. |
| Square never shows "offline" | The pack was not found. Square only offers it when the file is there. |
| A new Waddle Forever version | Make the pack again (the tool reads the server code from the install, so the pack and the game must come from the same install). Delete `offline/home/cache` after replacing the pack. |

## How it works (for developers)

- `emulator/src/offline.rs` runs the server on its own thread with an embedded QuickJS (`rquickjs`; the Vita's bindings are vendored in `emulator/vendor/rquickjs-sys`).
- `emulator/offline/prelude.js` is the part of Node the server code needs (module loader, `fs` on the pack and the data folder, `path`, `Buffer`, a small express, `net` sockets, timers); `boot.js` starts Waddle Forever's `boot.js` and answers the menu's `/vita/*` requests the way the PC companion does.
- `backends/navigator.rs` hands requests for `http://offline:24105/` to the server directly and opens the game's sockets (login 24106, world 24107) as in-process pipes.
- The pack (`WVPACK01`): 16-byte header, a JSON index `{files: {key: [offset, length]}}`, then the data. Keys: `code/...` (server code), `media/...` (game files), `code/index/mediapath.json` (see speed-ups).
- Speed-ups (the Vita runs this code 10-30 times slower than a PC; a cold start measured about 68 s plus 45 s of generated files):
  - **bytecode cache**: compiled modules are written to `home/cache/bc` and read back instead of being parsed again;
  - **file-reference table**: building a day's data resolves 26,000 file references (half of the 43 s); the pack tool records every answer while it builds the union of dates, and `boot.js` answers from the table;
  - **generated-file cache**: the crumbs files take 20 s each to generate; they are kept in `home/cache/gen`, keyed by the date, settings, mods and the pack's build time;
  - **path cache** in the `path` shim, and **background start** when the app opens with "offline" chosen.
- `tools/offline/media-union.js` builds every supported date once on the PC to find which files are used (22,546 files, 1.2 GB) and to record the reference table.

## Measured on a Vita (feasibility test, 2026-10-17, before the speed-ups)

| | PC | Vita (444 MHz) |
| --- | --- | --- |
| settings + timeline data modules | 1.0 s | 17.5 s |
| game data modules | 0.3 s | 5.6 s |
| GameData built for the date | 2.5 s | 43 s |
| file server built | 0.4 s | 1.8 s |
| ready for the first request | ~4 s | ~68 s |
| generate local_crumbs.swf / global_crumbs.swf | 1.8 s / 2.2 s | 21 s / 22 s |
| serve a normal file | 5-80 ms | 70-390 ms |
| JS memory | 15 MB | 11 MB |

Findings from that test: the Vita refuses files more than nine folders below `ux0:/` and VitaShell drops random files from big copies (hence the single pack file).
