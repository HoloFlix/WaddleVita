# Changelog

## 0.2.0 - 2026-10-18

**Offline mode (new)**
- Play with no PC: Waddle Forever's own server code runs inside the app (embedded QuickJS). Choose **offline** on the Server tab (Square), after making an `offline.pack` from your Waddle Forever install with the new pack tool (`Offline/Build Offline Pack.bat`) and copying it to `ux0:data/WaddleVita/offline/`. See `OFFLINE.md`.
- Dates 2005-08-22 to 2011-06-26, the Waddle Forever page of the pause menu (timeline date, settings, mods, reset) and a penguin saved on the Vita all work offline. The admin page, NPCs and mascots need the PC server.
- Start-up speed-ups for the server (bytecode cache, a table of file references made by the pack tool, a cache of generated files, background start when the app opens).

**Vita app**
- **More dates.** 2010-11-19 to 2011-06-26 (the first ActionScript 3 game client) now starts: the game was told it was running as a stand-alone player and looked for a settings file that does not exist; it now runs as it would in a browser. About 150 MB in the town. 2011-06-27 onward (the big client) works on a PC but not on the Vita (30 s start, 5-20 fps, long freezes, 250+ MB, a 2.4 s memory cleanup): the timeline marks those dates "no" and will not start them (developer override: an empty `allow_heavy.txt` in the app data folder).
- **Memory.** (Mostly for the big client.) The server game's garbage collector now keeps garbage to about 20% of the live data and does a full collection when the heap passes a budget (80 ms on a PC, 2.4 s on a Vita). In the big client this keeps the town near 240-255 MB instead of 315 MB and rising.
- **Admin code** field on the Server tab (Start button), sent to the server for the Waddle Forever menu.
- **Server finder** really included this time: the Server tab lists servers found by the UDP broadcast (0.1.0 shipped the server side only), Square switches between several.
- Tracker requests from the old portal (analytics) are dropped instead of being retried against the server.

**PC companion**
- **Admin code** made on first start; the admin page and the Vita's menu need it from other devices, never from the PC itself.
- The start script now checks and fixes the first run: finds Waddle Forever through the installer's records, offers to close its window, stops an old copy of the server, creates the firewall rules, and offers the download page when Waddle Forever is missing.
- The address list shows only the real network (no WSL, Docker, VPN or Hyper-V adapters), best first.
- macOS and Linux start scripts (untested on real machines); data folder follows Waddle Forever's (`~/.waddleforever` there).

## 0.1.0 - first release

**Vita app**
- Runs Club Penguin's original Flash client against a Waddle Forever server, from 2005-08-22 to 2010-11-18.
- Server tab with a saved address and Play.
- Club Penguin controls: pointer on the sticks, quick keys on the buttons, L-chords for dance / sit / joke / emote, Start = Backspace.
- Waddle Forever menu in the pause menu: timeline with year / month / events filters, server settings, mods, reload, world reset.
- Memory: shared movies, rooms and games released when left, background loading and a memory-card cache. A normal session stays between 100 and 200 MB of the 310 MB limit.
- Sound: the sound thread runs below the game so busy sounds can no longer freeze the screen; short effects are decoded once.
- Fixed: the oldest loader (2008-2010 dates) showed a white screen.

**PC companion**
- One-click start with firewall setup, Vita address shown, no Node.js needed (uses Waddle Forever's own).
- Admin page: players, items and coins, teleport, kick / mute / ban, chat log, timeline, settings, mods.
- Six server messages the 2008-2011 client understands.
- NPC penguins (population, rooms, talking, pairs and groups, Card-Jitsu / Find Four / sled opponents), mascots with buddy requests and backgrounds, scheduled appearances, a timed tour guide.

**Known limits**
- The big client (2011-06-27 onward) is at the edge of the Vita's memory.
- The Vita keyboard only adds text (use Start to delete).
- NPCs join sled races but do not race; Mancala and treasure-hunt tables have no NPC opponent.
