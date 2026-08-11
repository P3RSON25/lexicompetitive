# Word Assault Web

Simple Node.js + Express + Socket.io multiplayer word game.

## PVP rules

- Rooms are battle-only and need at least two players to start.
- Each player holds three random common bigrams and receives three new ones after each accepted word.
- One, two, and three matching grams deal 1, 3, and 6 base lines.
- Two-gram words build a combo up to 4; each combo point adds one line.
- One-gram words reset combo, and three-gram words cash out combo and hit every living opponent.
- Incoming garbage stays pending for four seconds, then locks onto the cosmetic 10 x 20 health board.
- Words cancel pending garbage first; with no pending garbage, they clear locked garbage while still sending the full attack.
- KO, Equal, and Random routing select a living opponent for one- and two-gram attacks.

## Run

```powershell
npm install
npm run dev
```

The server uses `C:\Users\wenyu\Downloads\word dictionary final.json` by
default. Set `WORDS_FILE` before starting the server if you need to override
that path.

Open `http://localhost:3000` in two browser windows. Create a room in one
window, join its code in the other, and start the game from the host window.

With the server running, `npm run smoke` checks two Socket.io clients, room
creation/joining, game start, and local dictionary validation.

The local dictionary is authoritative. If it cannot be read, word submissions
are rejected until the configured file is available.
