# Waddle Forever companion

A small JSON API that runs **inside the same process as Waddle Forever's server**, so a client without Waddle Forever's desktop menu
(the PS Vita client) can pick a date on the timeline, change settings, switch mods and reset the world.

Waddle Forever keeps those controls in its Electron app (menu items that open windows); its server itself only reads `settings.json`.
This script starts Waddle Forever's three services (HTTP, login, world) itself and shares their live settings, then listens on a
fourth port for the API below. It uses Waddle Forever's own timeline code unchanged (loaded with the Electron parts stubbed), so
the dates and events are the same as in its picker.

Tested with Waddle Forever **1.5.1**. It imports the app's compiled `server/` modules, so a different layout may need changes.

## You need

* Node.js 18 or newer.
* Your own copy of Waddle Forever (it provides the game files and the server code). **The game files belong to their owners and are
  not part of this project.**

## Run

Close Waddle Forever first (its app or its server): two copies would fight over the same ports.

```
node companion.js
```

Environment variables (all optional):

| Variable | Meaning | Default |
| --- | --- | --- |
| `WF_APP` | Waddle Forever's `resources/app` folder (holds `compiled/`) | `%LOCALAPPDATA%\Programs\Waddle Forever\resources\app` |
| `WF_ROOT` | the folder that holds `media/` (the server reads `./media/default/...` from the working directory) | the install folder |
| `WF_DATA_DIR` | folder in which a `WaddleForever/` data folder (settings, penguins, mods) is kept, so you can keep this server's data apart from the app's | `%APPDATA%` |
| `COMPANION_PORT` | the API port | `24110` |
| `COMPANION_TOKEN` | if set, every request must send it as the `X-Token` header | none |

Waddle Forever's own ports stay as they are: HTTP 24105, login 24106, world 24107. Open all four on the firewall for devices on your
network. Anyone who can reach the API can change the server's settings, so use a token if the network is not yours alone.

## API

All responses are JSON.

| Request | Answer |
| --- | --- |
| `GET /vita/info` | name, Waddle Forever version, current timeline date, the entry (below) and all settings |
| `GET /vita/entry` | what the client should start: `{ url, swf, width, height, flashvars }`, read from the server's own start page. It changes with the date: 2010 starts `/boots.swf` with `lang=en`; 2008 starts `/play/v2/load.swf`. |
| `GET /vita/timeline` | `{ years, current, days: [{ year, month, day, count }] }` (every day with events) |
| `GET /vita/timeline?year=2009` | the same days with their `events: [{ text, image, party }]` |
| `GET /vita/settings` | `{ settings }` |
| `POST /vita/settings` | `{ "settings": { "fps30": true }, "reset": true }`; unknown keys and wrong types are ignored; `reset` wipes the running world like Waddle Forever's picker |
| `POST /vita/version` | `{ "version": "2009-12-18", "reset": true }`; 400 for an invalid date |
| `GET /vita/mods` | `{ mods: [{ name, active }] }` |
| `POST /vita/mods` | `{ "name": "...", "state": true }` -> `{ ok: true }` or `{ ok: false, error }` |
| `POST /vita/reset` | `{ ok: true }` |

After a change of version or mods the client has to load the game again (Waddle Forever reloads its window): ask `/vita/entry` again
and restart.

## Admin dashboard

Waddle Forever itself has **no web admin page**: its server only serves the game files, and everything an admin does (timeline, settings,
mods, running commands as a player) is in the Electron app's windows. The companion adds a browser dashboard for that, at

```
http://<the PC>:24110/admin
```

It shows who is connected and lets you run Waddle Forever's chat commands as any of them (`ai 413`, `ac 1000`, `jr plaza`, ...; the list
is Waddle Forever's own and is shown in the page), pick the timeline date by year, switch settings and mods on and off, and reset the
world. The result of a command appears in that player's game, not on the page.

Waddle Forever has no accounts or moderator roles, so the only protection is the token: start the companion with `COMPANION_TOKEN=...`
and the page asks for it (it is sent as the `X-Token` header with every request and kept only for the browser session).
Without a token anybody on your network can open it. The extra endpoints it uses:

| Request | Answer |
| --- | --- |
| `GET /vita/players` | `{ players: [{ id, name }] }` |
| `GET /vita/commands` | `{ commands: [{ name, argNames, description, examples }] }` |
| `POST /vita/command` | `{ "id": 12, "command": "ai 413" }` runs the command as that player |

## One-click start (Windows)
Double-click `Start WaddleVita Server.bat`. It finds your Waddle Forever install (bring your own; the game files are not part of this project), opens the firewall ports once, starts the servers and prints the address. The Vita finds the PC by itself (UDP broadcast on port 24111) on the same Wi-Fi; Waddle Forever's own app must be closed first.

## NPC penguins, mascots, tour guide, messages
Open `http://<pc>:24110/admin`. New sections: **Send a message to players**, **NPC penguins**, **Mascots** (with scheduled appearances) and **Tour guide**. API: `GET /vita/npc`, `POST /vita/npc/config | clear | mascot | mascot/send | say | event | tour`, `POST /vita/message`, `GET /vita/messages/mascot`. NPC settings are saved in `%APPDATA%\WaddleForever\companion-npc.json`. Optional: if the repository's `.cache/vita/rooms` (from `node tools/build-vita-assets.js`) exists, NPCs only stand on walkable ground and walk through real doors; set `WF_WALK_DIR` to point elsewhere.
