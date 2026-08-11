# Word Assault Web

Simple Node.js + Express + Socket.io multiplayer word game.

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

If `WORDS_FILE` is not set or cannot be read, the server uses a small fallback
dictionary so the room and UI can still be tested.
