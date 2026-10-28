# Pixel Rush Live

Real multiplayer version of the Pixel Rush v5 prototype. One big-screen host page, phones join with a 6-digit PIN. The Node server owns all game state, timing and scoring.

## Run

```
cd pixel-rush-live
npm install
npm start          # http://localhost:3000  (PORT env var to change)
```

- Solo (you vs 11 bots): `http://localhost:3000/solo`
- Host (project this): `http://<your-ip>:3000/host`
- Players (phones): `http://<your-ip>:3000/`, enter the PIN and a nickname. Phones must reach your machine (same Wi-Fi, or deploy anywhere that runs Node and supports WebSockets).

## How it works

- `server.js`: HTTP static files + WebSocket game rooms. Phases: lobby, countdown, ready, question, reveal, board, podium. Answers, facts and scoring stay server-side until reveal. Same scoring as v5 (speed up to 1000, streak bonus up to 500, 2× on double rounds).
- `questions.js` + `bank.js`: 250 questions (true/false, type-the-answer, A/B design picks) across 11 topics and 5 decks. Each game draws a random set of the length the host chooses (default 20), with double-points rounds every 10 questions and at the finale. Add questions in `bank.js` with the `TF`, `T` and `AB` helpers (A/B rounds also need a mock in `public/mocks.js`).
- `public/host.*`: big-screen UI (deck fan, lobby arc, timer ring, vote bars, animated leaderboard, podium).
- `public/index.html` + `play.js`: phone UI (join, True/False, A/B, typed answers, result, rank, achievements).
- Reconnect: phones and the host rejoin automatically after a refresh or dropped connection. Players can only join during the lobby.
- Host controls: Start, End round now, Leaderboard / Next (or auto-advance), Restart, Quit, Play again. Enter also advances.
- Dark mode and sound toggles on every screen.

Solo mode (`/solo`) runs a one-player room on the server with 11 bots and auto-advancing rounds. Keys 1/T/A and 2/F/B answer True-False and A/B rounds, and your personal best is saved in the browser per deck and question count.
