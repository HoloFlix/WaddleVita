# WaddleVita 0.2.0 - play Club Penguin on a PS Vita, now with offline mode

**Download `WaddleVita-0.2.0.zip`** (about 10 MB). It holds the Vita app, the PC server helper, the offline pack tool and the documents. It does **not** hold any Club Penguin game files: you bring your own [Waddle Forever](https://github.com/nhaar/Waddle-Forever) install.

## New
- **Offline mode.** Play with no PC and no Wi-Fi: Waddle Forever's server runs inside the Vita app. Make a 1.3 GB `offline.pack` once from your Waddle Forever install (`Offline/Build Offline Pack.bat`), copy it to `ux0:data/WaddleVita/offline/`, then press Square on the Server tab until it says "offline". Steps in `OFFLINE.md`. First start on a Vita: server ready after about 52 s, plus about 50 s for two generated files.
- **More dates.** 2005-08-22 to 2011-06-26 now run (the first ActionScript 3 client, from 2010-11-19, was added).
- **Admin code** for the Waddle Forever menu from the Vita; easier first run on the PC (finds Waddle Forever, fixes the firewall); the Vita finds the server by itself on your network; macOS and Linux start scripts (untested).
- Lower memory use in the long sessions of the newer client.

## Known limits
- 2011-06-27 onward (the big client) does not fit the Vita's memory; the timeline marks those dates "no".
- Offline mode has no admin page, NPCs or mascots (they need the PC server) and is single-player.
- Music plays in minigames but not in rooms (present since early testing; the music files load, the cause is not found yet).
- macOS / Linux scripts and the offline pack tool on those systems are untested.

## Install in short
PC server: unzip, run `Server/Start WaddleVita Server.bat`. Vita: install `WaddleVita.vpk` with VitaShell, open it, Server tab, Play. Full guide: `README.md`.

SHA-256 of the zip: see `WaddleVita-0.2.0.zip.sha256`.
