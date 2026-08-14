# Ludo

A simple Ludo game built with plain HTML, CSS and JavaScript — no build step, no dependencies.

## Play

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

then visit http://localhost:8000

## Rules implemented

- 4 players (red, green, yellow, blue), 4 tokens each, played hot-seat on one device.
- Roll a 6 to move a token out of its base.
- Click a highlighted token to move it by the rolled amount.
- Landing on an opponent's token sends it back to its base, unless the cell is a safe (starred) cell.
- Rolling a 6, capturing a token, or getting a token home earns another roll.
- A token needs an exact roll to reach the centre; the first player to get all 4 tokens home wins.
