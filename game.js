/* Simple Ludo: 4 players, 4 tokens each, 15x15 board. */

const SIZE = 15;
const TOKENS_PER_PLAYER = 4;
const FINISH = 57; // progress value of a token that reached the centre

// The 52 cells of the main track, clockwise, starting at red's entry cell.
const TRACK = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7],
  [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14],
  [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7],
  [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0],
  [6, 0],
];

const PLAYERS = [
  {
    id: "red",
    name: "Red",
    entry: 0,
    base: [0, 0],
    homeRun: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
    centre: [7, 6.5],
  },
  {
    id: "green",
    name: "Green",
    entry: 13,
    base: [0, 9],
    homeRun: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
    centre: [6.5, 7],
  },
  {
    id: "yellow",
    name: "Yellow",
    entry: 26,
    base: [9, 9],
    homeRun: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
    centre: [7, 7.5],
  },
  {
    id: "blue",
    name: "Blue",
    entry: 39,
    base: [9, 0],
    homeRun: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
    centre: [7.5, 7],
  },
];

// Entry cells plus the star cell 8 steps later are safe from captures.
const SAFE_CELLS = new Set(
  PLAYERS.flatMap((p) => [p.entry, (p.entry + 8) % TRACK.length])
);

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const diceEl = document.getElementById("dice");
const scoresEl = document.getElementById("scores");
const resetEl = document.getElementById("reset");

let tokens = [];
let current = 0;
let dice = null;
let movable = [];
let winner = null;
let busy = false;

function createTokens() {
  return PLAYERS.flatMap((player, playerIndex) =>
    Array.from({ length: TOKENS_PER_PLAYER }, (_, i) => ({
      id: `${player.id}-${i}`,
      player: playerIndex,
      slot: i,
      progress: 0, // 0 = in base, 1..51 = main track, 52..56 = home run, 57 = home
      el: null,
    }))
  );
}

function trackIndex(token) {
  const player = PLAYERS[token.player];
  return (player.entry + token.progress - 1) % TRACK.length;
}

function baseSlot(player, slot) {
  const [row, col] = player.base;
  return [row + 1.5 + (slot > 1 ? 3 : 0), col + 1.5 + (slot % 2 ? 3 : 0)];
}

function tokenCell(token) {
  const player = PLAYERS[token.player];
  if (token.progress === 0) return baseSlot(player, token.slot);
  if (token.progress <= 51) return TRACK[trackIndex(token)];
  if (token.progress < FINISH) return player.homeRun[token.progress - 52];
  return player.centre;
}

function buildBoard() {
  boardEl.innerHTML = "";

  const pathCells = new Map();
  TRACK.forEach(([row, col], index) => {
    pathCells.set(`${row}-${col}`, { index });
  });
  const coloured = new Map();
  PLAYERS.forEach((player) => {
    coloured.set(TRACK[player.entry].join("-"), player.id);
    player.homeRun.forEach(([row, col]) => coloured.set(`${row}-${col}`, player.id));
  });

  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const cell = document.createElement("div");
      cell.className = "cell";
      const key = `${row}-${col}`;
      const path = pathCells.get(key);
      const colour = coloured.get(key);

      if (path) cell.classList.add("path");
      if (colour) cell.classList.add(colour);
      if (path && SAFE_CELLS.has(path.index)) cell.classList.add("safe");
      if (!path && !colour) cell.classList.add("base");

      boardEl.appendChild(cell);
    }
  }

  PLAYERS.forEach((player) => {
    const box = document.createElement("div");
    box.className = "base-box";
    box.style.left = `${(player.base[1] / SIZE) * 100}%`;
    box.style.top = `${(player.base[0] / SIZE) * 100}%`;
    box.style.background = `var(--${player.id})`;
    const inner = document.createElement("div");
    inner.className = "inner";
    box.appendChild(inner);
    boardEl.appendChild(box);
  });

  const centre = document.createElement("div");
  centre.className = "center";
  boardEl.appendChild(centre);

  tokens.forEach((token) => {
    const el = document.createElement("div");
    el.className = `token ${PLAYERS[token.player].id}`;
    el.addEventListener("click", () => onTokenClick(token));
    token.el = el;
    boardEl.appendChild(el);
  });
}

function render() {
  const occupancy = new Map();
  tokens.forEach((token) => {
    const [row, col] = tokenCell(token);
    const key = `${row}-${col}`;
    const list = occupancy.get(key) || [];
    list.push(token);
    occupancy.set(key, list);
  });

  occupancy.forEach((list) => {
    list.forEach((token, i) => {
      const [row, col] = tokenCell(token);
      const spread = list.length > 1 ? (i - (list.length - 1) / 2) * 0.28 : 0;
      token.el.style.left = `${((col + 0.5 + spread) / SIZE) * 100}%`;
      token.el.style.top = `${((row + 0.5) / SIZE) * 100}%`;
      token.el.textContent = list.length > 1 ? String(list.length) : "";
      token.el.classList.toggle("stacked", list.length > 1);
      token.el.classList.toggle("movable", movable.includes(token));
    });
  });

  scoresEl.innerHTML = "";
  PLAYERS.forEach((player, index) => {
    const home = tokens.filter((t) => t.player === index && t.progress === FINISH).length;
    const li = document.createElement("li");
    li.className = index === current && !winner ? "active" : "";
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = `var(--${player.id})`;
    li.appendChild(swatch);
    li.appendChild(document.createTextNode(`${player.name}: ${home}/${TOKENS_PER_PLAYER} home`));
    scoresEl.appendChild(li);
  });
}

function legalMoves(playerIndex, roll) {
  return tokens.filter((token) => {
    if (token.player !== playerIndex || token.progress === FINISH) return false;
    if (token.progress === 0) return roll === 6;
    return token.progress + roll <= FINISH;
  });
}

function targetProgress(token, roll) {
  return token.progress === 0 ? 1 : token.progress + roll;
}

function capture(token) {
  if (token.progress === 0 || token.progress > 51) return false;
  const index = trackIndex(token);
  if (SAFE_CELLS.has(index)) return false;

  const victims = tokens.filter(
    (other) =>
      other !== token &&
      other.player !== token.player &&
      other.progress > 0 &&
      other.progress <= 51 &&
      trackIndex(other) === index
  );
  victims.forEach((victim) => {
    victim.progress = 0;
  });
  return victims.length > 0;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function playerName(index) {
  return PLAYERS[index].name;
}

function nextPlayer() {
  current = (current + 1) % PLAYERS.length;
  dice = null;
  movable = [];
  setStatus(`${playerName(current)}'s turn — roll the dice`);
  diceEl.disabled = false;
  render();
}

function rollDice() {
  if (winner || busy || dice !== null) return;
  const roll = 1 + Math.floor(Math.random() * 6);
  dice = roll;
  movable = legalMoves(current, roll);
  diceEl.textContent = `🎲 ${roll}`;
  diceEl.disabled = true;

  if (movable.length === 0) {
    setStatus(`${playerName(current)} rolled ${roll} — no legal move`);
    busy = true;
    render();
    window.setTimeout(() => {
      busy = false;
      diceEl.textContent = "Roll";
      nextPlayer();
    }, 900);
    return;
  }

  setStatus(`${playerName(current)} rolled ${roll} — pick a token`);
  render();
}

function onTokenClick(token) {
  if (winner || busy || dice === null || !movable.includes(token)) return;

  const roll = dice;
  token.progress = targetProgress(token, roll);
  const captured = capture(token);
  const finished = token.progress === FINISH;

  movable = [];
  dice = null;
  render();

  const playerTokens = tokens.filter((t) => t.player === token.player);
  if (playerTokens.every((t) => t.progress === FINISH)) {
    winner = token.player;
    setStatus(`${playerName(winner)} wins! 🎉`);
    diceEl.disabled = true;
    render();
    return;
  }

  diceEl.textContent = "Roll";
  if (roll === 6 || captured || finished) {
    const reason = roll === 6 ? "rolled a 6" : captured ? "captured a token" : "got a token home";
    setStatus(`${playerName(token.player)} ${reason} — roll again`);
    diceEl.disabled = false;
    render();
    return;
  }

  nextPlayer();
}

function newGame() {
  tokens = createTokens();
  current = 0;
  dice = null;
  movable = [];
  winner = null;
  busy = false;
  diceEl.textContent = "Roll";
  diceEl.disabled = false;
  buildBoard();
  setStatus(`${playerName(current)}'s turn — roll the dice`);
  render();
}

diceEl.addEventListener("click", rollDice);
resetEl.addEventListener("click", newGame);

newGame();
