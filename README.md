# Ludo

A Ludo game built with plain HTML, CSS and JavaScript — no build step, no dependencies.

## Play

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

then visit http://localhost:8000

Pick 2-4 players on the setup screen, name them, and set each seat to **Human** or
**Computer** — so you can play solo against the CPU or hot-seat with friends.

## Rules implemented

- 4 tokens per player; roll a 6 to release one from its base.
- Click a highlighted token to move it by the rolled amount.
- Landing on an opponent sends it back to its base, unless the cell is a safe (starred) cell.
- Two tokens of the same colour on one cell form a **block** that opponents cannot pass or land on.
- A 6, a capture, or a token reaching home earns another roll — but **three 6s in a row forfeits the turn**.
- A token needs an exact roll to reach the centre.
- Players are ranked as they get all four tokens home; the final standings are shown when only one player is left.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Markup: board container, side panel, setup and results dialogs |
| `styles.css` | Board geometry, tokens, dice, dialogs, responsive layout |
| `game.js` | Board data, rules, dice/move animation, sound effects, CPU opponents |
