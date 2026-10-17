# WaddleVita

**Play Club Penguin on a PS Vita, from your own PC server.**

WaddleVita is a Vita app that runs the original Club Penguin game files (Flash) and connects them to a
[Waddle Forever](https://github.com/nhaar/Waddle-Forever) server running on your PC. You pick a date on the timeline and the
island is the island of that day: rooms, music, clothes, parties and minigames.

It is made of two parts:

| Part | What it is | Where it runs |
| --- | --- | --- |
| **WaddleVita.vpk** | The Vita app: a Flash player (a modified [RuffleVita](https://github.com/ibrahim-dogan/vita-flash-emulator), which is built on [Ruffle](https://ruffle.rs)) with Club Penguin controls, a server finder and a Waddle Forever menu | PS Vita |
| **Server/** | The WaddleVita companion: starts Waddle Forever's server, lets the Vita find it, and adds an admin page, NPC penguins, mascots and a tour guide | Your PC (Windows; macOS and Linux untested) |
| **Offline/** (optional) | The offline pack tool: makes `offline.pack` from your Waddle Forever install so the Vita can run the server itself | Your PC, once |

> **Not included:** the Club Penguin game files. They are not part of this project and cannot be shared. They come with
> [Waddle Forever](https://github.com/nhaar/Waddle-Forever), which you install yourself. This project is unofficial and not
> connected to Disney, Club Penguin or Waddle Forever.

**Do I have to move files around?** No. Install Waddle Forever normally, start it once so it downloads its game files, close it, and
run the WaddleVita start script. The script finds Waddle Forever where the installer put it and uses its server and game files in place;
nothing is copied or edited. Waddle Forever's own server is the server (WaddleVita adds a small helper beside it), so your penguin, items and
friends live in Waddle Forever's normal data folder.

---

## What you need

- A **PS Vita or PS TV** with HENkaku / Ensō and **VitaShell** (to install a VPK). "Enable Unsafe Homebrew" is not needed.
- A **PC on the same Wi-Fi network** as the Vita: Windows (one-click start), or macOS / Linux (see below).
- **[Waddle Forever](https://github.com/nhaar/Waddle-Forever/releases)** installed on that PC. Run it once so it finishes downloading its game files, then close it.

## Install

### 1. On the PC

**Windows**
1. Unzip this release anywhere (for example `C:\WaddleVita`).
2. Double-click **`Server\Start WaddleVita Server.bat`**.
3. It checks everything for you and asks before it changes anything:
   - if Waddle Forever's own window is open (same ports) it offers to close it;
   - if an old copy of this server is still running it offers to stop it;
   - it opens the Windows Firewall ports once (Windows asks for administrator permission);
   - if Waddle Forever is not installed it offers to open its download page.
4. The window then shows:

   ```
   ================  WaddleVita server is running  ================
   Vita address:  192.168.0.239
   Admin page:    http://localhost:24110/admin
   Admin code:    26709576
   ```
5. Leave the window open while you play. Close it to stop the server.

**macOS / Linux** (new, not yet tested on real machines: please report what happens)
1. You need Node.js 18 or newer, and Waddle Forever: the app in `/Applications` on macOS; on Linux an unpacked release or a source checkout that was built (`yarn install && yarn build`), in `~/Waddle-Forever` or anywhere with `WF_APP=/path` set. Its game files (`media/default`) must be beside it, as Waddle Forever's own instructions say.
2. In a terminal: `sh Server/start-server.sh` (on macOS you can also run `sh "Server/Start WaddleVita Server.command"`).
3. If a firewall is on, the script prints the one command that lets the Vita in.

The server window shows the **Vita address** (your PC on the real network; virtual adapters from WSL, Docker or VPNs are left out) and an **admin code** (see below).

### 2. On the Vita
1. Copy **`WaddleVita.vpk`** to the Vita (USB, FTP with VitaShell, or Wi-Fi) and install it with VitaShell.
2. Open **WaddleVita** from the home screen.
3. Go to the **Server** tab (press **R** from the library).
4. The Vita finds your PC by itself and fills in its address ("Found MY-PC on your network"; **Square** switches between several). If it doesn't, press **Triangle** and type the address the PC window shows.
5. Press **Cross** on **Play**.

The first start downloads the game from your PC, so it takes a little while. Later starts are faster: the Vita keeps a copy on its memory card.

## Offline play (no PC)

WaddleVita can also run the server **on the Vita itself**: no PC, no Wi-Fi once it is set up. Dates 2005-08-22 to 2011-06-26 work, your penguin is saved on the Vita,
and the Waddle Forever page of the pause menu (timeline date, settings, mods) works. The admin page, NPC penguins and mascots need the PC server.
The first start takes a minute or two (measured: server ready after 52 s, then about 50 s more for two generated files). More detail: `OFFLINE.md`.

### Setup guide

You need a PC with **Waddle Forever installed and started once** (so it has downloaded its game files), the Vita with WaddleVita installed (see Install above),
and **1.4 GB free** on the Vita's memory card.

**1. Make the offline pack on the PC** (about 3 minutes)
- **Windows:** unzip this release, open the `Offline` folder and double-click **`Build Offline Pack.bat`**. It finds Waddle Forever by itself and uses Node.js if you have it, otherwise Waddle Forever's own copy.
- **macOS / Linux** (or Waddle Forever in an unusual place): install Node.js 18+ and run
  `node Offline/build-pack.js --wf "<your Waddle Forever folder>" --out offline-pack`
  (the folder that contains `media` and `resources`).
- When it says **done** you have `offline-pack/offline.pack` (about 1.3 GB) and `offline.pack.sha256`.
  The pack is made from your own install and is for your own use; do not share it, it contains the game's files.

**2. Copy it to the Vita**
- Connect the Vita to the PC with VitaShell's **USB** or **FTP** mode.
- Make the folder **`ux0:data/WaddleVita/offline/`** if it is not there and copy **`offline.pack`** into it, so the full path is `ux0:data/WaddleVita/offline/offline.pack`.
- Check the size on the Vita is exactly the same as on the PC. A short copy is the most common problem; copy again if it differs (`offline.pack.sha256` is the checksum if you want to verify it).

**3. Play**
- Open WaddleVita, go to the **Server** tab (**R** from the library) and press **Square** until the address box says **offline**. (Square goes through any servers found on your network first. It only offers "offline" when the pack is in place.)
- Press **Cross** on **Play**. The loading screen shows the server's steps and a clock. WaddleVita remembers the choice and starts the server as soon as you open the app, so later it is already warming up while you are in the menus.
- Pick another date any time in the pause menu (**Select**, **Waddle Forever**, **Timeline date**).

Your penguin lives in `ux0:data/WaddleVita/offline/home/.waddleforever` on the Vita, separate from the PC's. Back that folder up if it matters to you.
To go back to a PC server, press Square on the Server tab to pick it (or type its address with Triangle).
If Waddle Forever updates, make the pack again and delete `ux0:data/WaddleVita/offline/home/cache`.

## Playing

### Controls (Club Penguin profile)
| Button | Does |
| --- | --- |
| Left / right stick | Move the pointer |
| **Cross** or **R** | Click (walk, press buttons, open chat) |
| **Circle** | Enter (focus the chat box) |
| **Square** | Throw a snowball (then click where) |
| **Triangle** | Wave |
| **L + Cross** | Dance |
| **L + Circle** | Sit |
| **L + Square** | Tell a joke |
| **L + Triangle** | Emote key (E), then pick with the screen |
| **Start** | Backspace (deletes a letter, repeats while held) |
| **Select** | Pause menu |
| **L + R + Start** | Pause menu, always |

The front touch screen also works as a pointer. Change any button in the pause menu under Controls.
Typing: tap the chat box and the Vita's keyboard opens. It can only add text, so use **Start** to delete.

### The pause menu (Select)
Besides the normal RuffleVita options there is a **Waddle Forever** page:

- **Timeline date** - pick a day. Filters: **L / R** change the year, **Left / Right** the month, **Triangle** shows only days with events. Choosing a date reloads the game.
- **Server settings** - Waddle Forever's switches (30 fps, idle timer, clothing and more).
- **Mods** - turn Waddle Forever mods on and off (mods are folders in Waddle Forever's `mods` folder).
- **Reload the game** / **Reset the world**.

### Which dates work
| Dates | On the Vita |
| --- | --- |
| 2005-08-22 to 2011-06-26 | **Works.** The game client changes at 2008-07-15 and 2010-11-19; all of these run (the newest part uses about 150 MB). |
| 2011-06-27 onward (the big new client) | **No.** On the Vita it takes about 30 seconds to start, then runs at 5-20 frames per second, freezes for several seconds when a room loads (the menus do not answer meanwhile), and grows past 250 MB of the 310 MB with every room you visit. The timeline marks these dates "no" and will not start them. (To try anyway, create an empty file `ux0:data/WaddleVita/allow_heavy.txt`; expect problems.) They run well in RuffleVita on a PC. |

Your penguin is the same on every date (name, clothes, coins, friends). The date only changes what the island offers.
It is also the same penguin you get when you play Waddle Forever on the PC.

## The admin page and NPCs

Open `http://localhost:24110/admin` on the PC (or `http://<PC address>:24110/admin` from a phone on the same network).

- **Players** - see who is online; give items and coins, teleport, rename, kick, mute, ban.
- **Chat log, bans and mutes**.
- **Send a message to players** - the notices the 2008-2011 client already understands: a chat-log notice, a moderator-action line, a mascot message, the tour-guide bubble, an error pop-up (such as "the server is restarting"), a scavenger-hunt day.
- **NPC penguins** - computer-played penguins that walk, talk, make friends and play with players. You set how many, which rooms, how much they talk, how often they pair up or form groups, and whether they join players waiting for a Card-Jitsu, Find Four or sled-race opponent.
- **Mascots** - Rockhopper, Gary, Aunt Arctic and the others can appear on the island, roam, say their lines and send each player they meet a buddy request. Accepting gives the mascot's background. Schedule appearances for a time of day.
- **Tour guide** - a timed tour of the island that announces each stop.
- **Timeline, settings, mods, world reset**.

Mascot accounts are Waddle Forever's own: you can also log in as one by name to play it yourself.

**Admin code.** The first time the server starts it makes an 8-digit admin code (kept in Waddle Forever's data folder as `companion-code.txt`) and shows it in the server window.
This PC never needs it; **other devices do**: a phone or another PC opening the admin page is asked for it, and the Vita needs it for the Waddle Forever menu
(Server tab, **Start** button, type it once). Playing never needs the code. To choose your own, set `COMPANION_TOKEN` before starting; `COMPANION_OPEN=1` turns the code off.
Never expose the server's ports to the internet.

## Troubleshooting

| Problem | Try |
| --- | --- |
| The Vita does not find the PC | Same Wi-Fi? Router "client isolation" off? Firewall rule created (run the start script again)? Type the address by hand (Triangle). |
| "Waddle Forever was not found" | Install it in the normal place, or set `WF_APP` to its `resources\app` folder. |
| "Waddle Forever's own app is open" | Let the script close it, or close its window and tray icon yourself. |
| The Waddle Forever menu says it needs an admin code | Type the code from the server window on the Server tab (Start button). |
| The pause menu or buttons do not answer | The game is busy loading (a room, a minigame) and the Vita cannot do two things at once: wait a few seconds. On dates from 2011-06-27 this lasts up to half a minute, so use an earlier date. |
| White or blue screen | Send the log and the date. |
| The game stops / "out of memory" | Go back to the Library and start again. Long sessions use more memory; the oldest dates use the least. |
| Crackling sound | Fixed for most sounds. If it still happens in a busy room, tell us (see Reporting). |
| Where is the log? | `ux0:data/WaddleVita/log.txt` on the Vita. |

## Reporting problems
Send `ux0:data/WaddleVita/log.txt` (from right after the problem) and the date you were on. Do not post your server address or admin code publicly.

## Building from source
See `BUILDING.md`.

## Credits and licences
See `THIRD_PARTY.md`. In short: [Ruffle](https://ruffle.rs) (MIT/Apache-2.0), [RuffleVita](https://github.com/ibrahim-dogan/vita-flash-emulator) by Ibrahim Dogan, [Waddle Forever](https://github.com/nhaar/Waddle-Forever) by nhaar and contributors (MIT), vitaGL, SDL2, and the Nunito, Lilita One and Inter fonts (SIL OFL).
