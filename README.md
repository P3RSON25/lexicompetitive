# Word Assault Web

Simple Node.js + Express + Socket.io multiplayer word game.

## PVP rules

- Rooms are battle-only and need at least two players to start.
- Each player holds three random common bigrams and receives three new ones after each accepted word.
- One, two, and three matching grams deal 1, 3, and 6 base lines.
- Words made entirely by chaining held grams have their attack halved, rounded down.
- Every letter outside the matched gram letters adds 0.5 lines; the final attack is rounded down.
- Two-gram words build a combo up to 4; each combo point adds one line.
- One-gram words reset combo, and three-gram words cash out combo and hit every living opponent.
- Incoming garbage stays pending for four seconds, then locks onto the cosmetic 10 x 20 health board.
- The pending deadline can extend for eight additional incoming attacks; later attacks still add garbage without extending the timer.
- Words cancel pending garbage first; with no pending garbage, they clear locked garbage while still sending the full attack.
- KO, Equal, and Random routing select a living opponent for one- and two-gram attacks.

## Run

```powershell
npm install
npm run dev
```

The server prefers `C:\Users\wenyu\Downloads\word dictionary final.json` when
that file is available. The same dictionary is bundled at
`data/word dictionary final.json` for deployments where the Windows Downloads
path does not exist. Set `WORDS_FILE` before starting the server to use another
dictionary file.

Open `http://localhost:3000` in two browser windows. Create a room in one
window, join its code in the other, and start the game from the host window.

With the server running, `npm run smoke` checks two Socket.io clients, room
creation/joining, game start, and local dictionary validation.

The local dictionary is loaded first. If it cannot be read, word submissions
are rejected until the configured file is available.

Words missing from the local dictionary are checked with Datamuse using an
exact-match comparison. An exact result is added to the server's shared
in-memory dictionary for all players; near matches are rejected.
