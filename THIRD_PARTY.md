# Third-party software

WaddleVita contains or depends on the following. Their licences apply to their parts.

| Component | Author / licence | Used for |
| --- | --- | --- |
| [Ruffle](https://github.com/ruffle-rs/ruffle) | Ruffle LLC and contributors, MIT or Apache-2.0 | The Flash player core (patched copy in the VPK) |
| [RuffleVita](https://github.com/ibrahim-dogan/vita-flash-emulator) | Ibrahim Dogan | The Vita app this is built on (library UI, renderer, input, audio). **Its repository states no licence; check with the author before redistributing the source or binaries widely.** |
| [Waddle Forever](https://github.com/nhaar/Waddle-Forever) | nhaar and contributors, MIT (its licence does not cover the game media) | The server the companion starts. Installed separately by the user, not included. |
| [QuickJS](https://bellard.org/quickjs/) via the [rquickjs](https://github.com/DelSkayn/rquickjs) crate | Fabrice Bellard and Charlie Gordon (MIT); rquickjs authors (MIT) | The JavaScript engine that runs Waddle Forever's server in offline mode (the Vita bindings are a vendored copy of `rquickjs-sys` with one added file). |
| [vitaGL](https://github.com/Rinnegatamante/vitaGL), vitasdk, [SDL2 (Northfear Vita fork)](https://github.com/Northfear/SDL) | Rinnegatamante; vitasdk team; SDL authors (zlib) | Graphics, system and input on the Vita |
| Nunito, Lilita One, Inter | SIL Open Font License 1.1 (texts in `emulator/assets/fonts`) | App interface fonts |

## Not included, not licensed here
- Club Penguin game files, art, music and the Waddle Forever media folder belong to their owners (Disney / the original game's makers) and are not distributed with WaddleVita.
- WaddleVita is an unofficial fan project. "Club Penguin" and "Disney" are trademarks of their owners.

## WaddleVita's own parts
The companion (`Server/`), the Club Penguin controls, server finder, Waddle Forever menu and the documents in this release are by the WaddleVita authors. Pick a licence for them before publishing (MIT is suggested), and put it in `LICENSE`.
