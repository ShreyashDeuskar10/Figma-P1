/* Ludo: 2-4 players (human or computer), full rules, hot-seat in one page. */

const SIZE = 15;
const TOKENS_PER_PLAYER = 4;
const FINISH = 57; // progress value of a token that reached the centre
const STEP_MS = 130; // per-cell hop while a token moves

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

const COLOURS = [
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

// With fewer than 4 players the seats are spread around the board.
const SEATS = { 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] };

// Entry cells plus the star cell 8 steps later are safe from captures.
const SAFE_CELLS = new Set(
  COLOURS.flatMap((c) => [c.entry, (c.entry + 8) % TRACK.length])
);

const DICE_FACES = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

const el = {
  board: document.getElementById("board"),
  status: document.getElementById("status"),
  dice: document.getElementById("dice"),
  roll: document.getElementById("roll"),
  scores: document.getElementById("scores"),
  newGame: document.getElementById("new-game"),
  mute: document.getElementById("mute"),
  setup: document.getElementById("setup"),
  setupForm: document.getElementById("setup-form"),
  playerCount: document.getElementById("player-count"),
  seats: document.getElementById("seats"),
  result: document.getElementById("result"),
  resultTitle: document.getElementById("result-title"),
  resultList: document.getElementById("result-list"),
  playAgain: document.getElementById("play-again"),
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ---------------------------------------------------------------- audio --- */

const sfx = (() => {
  let ctx = null;
  let muted = false;

  function audio() {
    if (!ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(freq, duration, { type = "triangle", gain = 0.07, delay = 0, glideTo = 0 } = {}) {
    if (muted) return;
    const ac = audio();
    if (!ac) return;
    const start = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, start + duration);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(gain, start + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(amp).connect(ac.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  return {
    get muted() {
      return muted;
    },
    toggle() {
      muted = !muted;
      return muted;
    },
    roll() {
      for (let i = 0; i < 5; i += 1) {
        tone(220 + i * 40, 0.05, { type: "square", gain: 0.04, delay: i * 0.07 });
      }
    },
    hop() {
      tone(660, 0.07, { gain: 0.05 });
    },
    capture() {
      tone(420, 0.35, { type: "sawtooth", gain: 0.08, glideTo: 110 });
    },
    home() {
      [523, 659, 784].forEach((f, i) => tone(f, 0.18, { delay: i * 0.1 }));
    },
    win() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, { delay: i * 0.14, gain: 0.09 }));
    },
    deny() {
      tone(200, 0.25, { type: "square", gain: 0.06, glideTo: 90 });
    },
  };
})();

/* ---------------------------------------------------------------- state --- */

const state = {
  players: [], // { colour, name, isAI, seat }
  tokens: [],
  current: 0,
  dice: null,
  movable: [],
  sixStreak: 0,
  finishOrder: [],
  busy: false,
  over: false,
};

const colourOf = (playerIndex) => state.players[playerIndex].colour;

function trackIndexAt(playerIndex, progress) {
  return (colourOf(playerIndex).entry + progress - 1) % TRACK.length;
}

function trackIndex(token) {
  return trackIndexAt(token.player, token.progress);
}

function onTrack(token) {
  return token.progress > 0 && token.progress <= 51;
}

function baseSlot(colour, slot) {
  const [row, col] = colour.base;
  return [row + 1.5 + (slot > 1 ? 3 : 0), col + 1.5 + (slot % 2 ? 3 : 0)];
}

function tokenCell(token) {
  const colour = colourOf(token.player);
  if (token.progress === 0) return baseSlot(colour, token.slot);
  if (token.progress <= 51) return TRACK[trackIndex(token)];
  if (token.progress < FINISH) return colour.homeRun[token.progress - 52];
  return colour.centre;
}

function tokensOf(playerIndex) {
  return state.tokens.filter((token) => token.player === playerIndex);
}

function playerDone(playerIndex) {
  return tokensOf(playerIndex).every((token) => token.progress === FINISH);
}

/* ---------------------------------------------------------------- rules --- */

// Two or more tokens of one player on a main-track cell block every opponent.
function blockedBy(trackIdx, playerIndex) {
  const counts = new Map();
  state.tokens.forEach((token) => {
    if (!onTrack(token) || token.player === playerIndex) return;
    if (trackIndex(token) !== trackIdx) return;
    counts.set(token.player, (counts.get(token.player) || 0) + 1);
  });
  return [...counts.values()].some((count) => count >= 2);
}

function pathIsClear(token, roll) {
  if (token.progress === 0) return !blockedBy(colourOf(token.player).entry, token.player);
  for (let step = 1; step <= roll; step += 1) {
    const progress = token.progress + step;
    if (progress > 51) break;
    if (blockedBy(trackIndexAt(token.player, progress), token.player)) return false;
  }
  return true;
}

function legalMoves(playerIndex, roll) {
  return state.tokens.filter((token) => {
    if (token.player !== playerIndex || token.progress === FINISH) return false;
    if (token.progress === 0 && roll !== 6) return false;
    if (token.progress > 0 && token.progress + roll > FINISH) return false;
    return pathIsClear(token, roll);
  });
}

function landingTrackIndex(token, roll) {
  const progress = token.progress === 0 ? 1 : token.progress + roll;
  return progress <= 51 ? trackIndexAt(token.player, progress) : null;
}

function capture(token) {
  if (!onTrack(token)) return 0;
  const idx = trackIndex(token);
  if (SAFE_CELLS.has(idx)) return 0;

  const victims = state.tokens.filter(
    (other) =>
      other !== token &&
      other.player !== token.player &&
      onTrack(other) &&
      trackIndex(other) === idx
  );
  victims.forEach((victim) => {
    victim.progress = 0;
  });
  return victims.length;
}

/* ------------------------------------------------------------- rendering --- */

function buildBoard() {
  el.board.innerHTML = "";

  const trackByCell = new Map();
  TRACK.forEach(([row, col], index) => trackByCell.set(`${row}-${col}`, index));
  const paint = new Map();
  COLOURS.forEach((colour) => {
    paint.set(TRACK[colour.entry].join("-"), colour.id);
    colour.homeRun.forEach(([row, col]) => paint.set(`${row}-${col}`, colour.id));
  });

  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const cell = document.createElement("div");
      const key = `${row}-${col}`;
      const trackIdx = trackByCell.get(key);
      const colourId = paint.get(key);
      cell.className = "cell";
      if (trackIdx !== undefined) cell.classList.add("path");
      if (colourId) cell.classList.add(colourId);
      if (trackIdx !== undefined && SAFE_CELLS.has(trackIdx)) cell.classList.add("safe");
      if (trackIdx === undefined && !colourId) cell.classList.add("blank");
      el.board.appendChild(cell);
    }
  }

  COLOURS.forEach((colour) => {
    const box = document.createElement("div");
    box.className = "base-box";
    box.style.left = `${(colour.base[1] / SIZE) * 100}%`;
    box.style.top = `${(colour.base[0] / SIZE) * 100}%`;
    box.style.background = `var(--${colour.id})`;
    const inner = document.createElement("div");
    inner.className = "inner";
    box.appendChild(inner);
    el.board.appendChild(box);
  });

  const centre = document.createElement("div");
  centre.className = "centre";
  COLOURS.forEach((colour) => {
    const wedge = document.createElement("i");
    wedge.className = `wedge ${colour.id}`;
    centre.appendChild(wedge);
  });
  el.board.appendChild(centre);

  state.tokens.forEach((token) => {
    const node = document.createElement("div");
    node.className = `token ${colourOf(token.player).id}`;
    node.addEventListener("click", () => onTokenClick(token));
    token.el = node;
    el.board.appendChild(node);
  });
}

function render() {
  const cells = new Map();
  state.tokens.forEach((token) => {
    const key = tokenCell(token).join("-");
    const list = cells.get(key) || [];
    list.push(token);
    cells.set(key, list);
  });

  cells.forEach((list) => {
    list.forEach((token, i) => {
      const [row, col] = tokenCell(token);
      const spread = list.length > 1 ? (i - (list.length - 1) / 2) * 0.42 : 0;
      token.el.style.left = `${((col + 0.5 + spread) / SIZE) * 100}%`;
      token.el.style.top = `${((row + 0.5) / SIZE) * 100}%`;
      token.el.textContent = list.length > 1 ? String(list.length) : "";
      token.el.classList.toggle("stacked", list.length > 1);
      token.el.classList.toggle("movable", state.movable.includes(token));
    });
  });

  el.scores.innerHTML = "";
  state.players.forEach((player, index) => {
    const home = tokensOf(index).filter((token) => token.progress === FINISH).length;
    const rank = state.finishOrder.indexOf(index);
    const li = document.createElement("li");
    li.className = index === state.current && !state.over ? "active" : "";
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = `var(--${player.colour.id})`;
    li.appendChild(swatch);
    const label = `${player.name}${player.isAI ? " (CPU)" : ""}: ${home}/${TOKENS_PER_PLAYER}`;
    li.appendChild(document.createTextNode(rank >= 0 ? `${label} — #${rank + 1}` : label));
    el.scores.appendChild(li);
  });
}

function showDice(value) {
  const pips = DICE_FACES[value] || [];
  [...el.dice.children].forEach((pip, i) => pip.classList.toggle("on", pips.includes(i)));
}

function setStatus(text) {
  el.status.textContent = text;
}

function playerLabel(index) {
  const player = state.players[index];
  return player.isAI ? `${player.name} (CPU)` : player.name;
}

function setRollEnabled(enabled) {
  el.roll.disabled = !enabled;
}

/* ------------------------------------------------------------------- AI --- */

function scoreMove(token, roll) {
  const target = token.progress === 0 ? 1 : token.progress + roll;
  let score = target;

  if (target === FINISH) score += 900;
  if (target > 51) score += 250;
  if (token.progress === 0) score += 400;

  const landing = landingTrackIndex(token, roll);
  if (landing !== null && !SAFE_CELLS.has(landing)) {
    const victims = state.tokens.filter(
      (other) =>
        other.player !== token.player && onTrack(other) && trackIndex(other) === landing
    );
    if (victims.length) score += 1000;

    const threatened = state.tokens.some((enemy) => {
      if (enemy.player === token.player || !onTrack(enemy)) return false;
      const gap = (landing - trackIndex(enemy) + TRACK.length) % TRACK.length;
      return gap >= 1 && gap <= 6;
    });
    if (threatened) score -= 300;
  } else if (landing !== null) {
    score += 60; // safe cell
  }

  return score;
}

function chooseAIMove(roll) {
  return state.movable.reduce((best, token) =>
    scoreMove(token, roll) > scoreMove(best, roll) ? token : best
  );
}

/* ------------------------------------------------------------ turn flow --- */

async function animateDice(value) {
  for (let i = 0; i < 6; i += 1) {
    showDice(1 + Math.floor(Math.random() * 6));
    await sleep(70);
  }
  showDice(value);
}

async function animateSteps(token, roll) {
  if (token.progress === 0) {
    token.progress = 1;
    sfx.hop();
    render();
    await sleep(STEP_MS * 2);
    return;
  }
  for (let step = 0; step < roll; step += 1) {
    token.progress += 1;
    sfx.hop();
    render();
    await sleep(STEP_MS);
  }
}

async function rollDice() {
  if (state.busy || state.over || state.dice !== null) return;
  const player = state.current;

  state.busy = true;
  setRollEnabled(false);
  setStatus(`${playerLabel(player)} is rolling…`);
  sfx.roll();
  const roll = 1 + Math.floor(Math.random() * 6);
  await animateDice(roll);

  state.sixStreak = roll === 6 ? state.sixStreak + 1 : 0;
  if (state.sixStreak === 3) {
    setStatus(`${playerLabel(player)} rolled three 6s — turn forfeited`);
    sfx.deny();
    await sleep(1200);
    state.busy = false;
    await endTurn();
    return;
  }

  state.dice = roll;
  state.movable = legalMoves(player, roll);

  if (!state.movable.length) {
    setStatus(`${playerLabel(player)} rolled ${roll} — no legal move`);
    render();
    await sleep(1000);
    state.dice = null;
    state.busy = false;
    if (roll === 6) {
      await grantExtraRoll(player, "rolled a 6");
    } else {
      await endTurn();
    }
    return;
  }

  state.busy = false;
  if (state.players[player].isAI) {
    setStatus(`${playerLabel(player)} rolled ${roll}`);
    render();
    await sleep(500);
    await performMove(chooseAIMove(roll));
  } else {
    setStatus(`${playerLabel(player)} rolled ${roll} — pick a token`);
    render();
  }
}

async function grantExtraRoll(player, reason) {
  setStatus(`${playerLabel(player)} ${reason} — rolling again`);
  render();
  if (state.players[player].isAI) {
    await sleep(700);
    await rollDice();
  } else {
    setStatus(`${playerLabel(player)} ${reason} — roll again`);
    setRollEnabled(true);
  }
}

async function performMove(token) {
  const roll = state.dice;
  const player = token.player;

  state.busy = true;
  state.dice = null;
  state.movable = [];
  setRollEnabled(false);
  render();

  await animateSteps(token, roll);

  const captured = capture(token);
  if (captured) {
    sfx.capture();
    setStatus(`${playerLabel(player)} captured ${captured > 1 ? `${captured} tokens` : "a token"}`);
    render();
    await sleep(500);
  }

  const finished = token.progress === FINISH;
  if (finished) sfx.home();
  render();

  if (playerDone(player) && !state.finishOrder.includes(player)) {
    state.finishOrder.push(player);
    sfx.win();
    setStatus(`${playerLabel(player)} is home — position #${state.finishOrder.length}!`);
    render();
    await sleep(1200);
  }

  state.busy = false;

  const remaining = state.players.filter((_, i) => !state.finishOrder.includes(i));
  if (remaining.length <= 1) {
    finishGame();
    return;
  }

  if (!state.finishOrder.includes(player) && (roll === 6 || captured || finished)) {
    const reason = roll === 6 ? "rolled a 6" : captured ? "captured a token" : "got a token home";
    await grantExtraRoll(player, reason);
    return;
  }

  await endTurn();
}

async function endTurn() {
  state.dice = null;
  state.movable = [];
  state.sixStreak = 0;
  showDice(0);

  let next = state.current;
  for (let i = 0; i < state.players.length; i += 1) {
    next = (next + 1) % state.players.length;
    if (!state.finishOrder.includes(next)) break;
  }
  state.current = next;

  setStatus(`${playerLabel(next)}'s turn — roll the dice`);
  render();

  if (state.players[next].isAI) {
    setRollEnabled(false);
    await sleep(800);
    await rollDice();
  } else {
    setRollEnabled(true);
  }
}

function finishGame() {
  state.over = true;
  state.players.forEach((_, index) => {
    if (!state.finishOrder.includes(index)) state.finishOrder.push(index);
  });
  setRollEnabled(false);
  render();

  const winner = state.finishOrder[0];
  el.resultTitle.textContent = `${playerLabel(winner)} wins!`;
  el.resultList.innerHTML = "";
  state.finishOrder.forEach((index) => {
    const li = document.createElement("li");
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = `var(--${state.players[index].colour.id})`;
    li.appendChild(swatch);
    const home = tokensOf(index).filter((token) => token.progress === FINISH).length;
    li.appendChild(document.createTextNode(`${playerLabel(index)} — ${home}/${TOKENS_PER_PLAYER} home`));
    el.resultList.appendChild(li);
  });
  el.result.classList.remove("hidden");
  setStatus(`${playerLabel(winner)} wins!`);
}

function onTokenClick(token) {
  if (state.over || state.busy || state.dice === null) return;
  if (state.players[state.current].isAI) return;
  if (!state.movable.includes(token)) return;
  performMove(token);
}

/* ----------------------------------------------------------- setup flow --- */

function renderSeats() {
  const count = Number(el.playerCount.value);
  const previous = new Map(
    [...el.seats.querySelectorAll(".seat")].map((seat) => [
      seat.dataset.colour,
      {
        name: seat.querySelector("input").value,
        kind: seat.querySelector("select").value,
      },
    ])
  );

  el.seats.innerHTML = "";
  SEATS[count].forEach((colourIndex, i) => {
    const colour = COLOURS[colourIndex];
    const saved = previous.get(colour.id);

    const row = document.createElement("div");
    row.className = "seat";
    row.dataset.colour = colour.id;
    row.dataset.index = String(colourIndex);

    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = `var(--${colour.id})`;

    const name = document.createElement("input");
    name.type = "text";
    name.maxLength = 14;
    name.value = saved ? saved.name : colour.name;
    name.setAttribute("aria-label", `${colour.name} player name`);

    const kind = document.createElement("select");
    kind.setAttribute("aria-label", `${colour.name} player type`);
    [
      ["human", "Human"],
      ["cpu", "Computer"],
    ].forEach(([value, text]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      kind.appendChild(option);
    });
    kind.value = saved ? saved.kind : i === 0 ? "human" : "cpu";

    row.append(swatch, name, kind);
    el.seats.appendChild(row);
  });
}

function startGame(seats) {
  state.players = seats.map((seat) => ({
    colour: COLOURS[seat.colourIndex],
    name: seat.name || COLOURS[seat.colourIndex].name,
    isAI: seat.isAI,
  }));
  state.tokens = state.players.flatMap((_, playerIndex) =>
    Array.from({ length: TOKENS_PER_PLAYER }, (_, slot) => ({
      id: `${playerIndex}-${slot}`,
      player: playerIndex,
      slot,
      progress: 0, // 0 = base, 1..51 = main track, 52..56 = home run, 57 = home
      el: null,
    }))
  );
  state.current = 0;
  state.dice = null;
  state.movable = [];
  state.sixStreak = 0;
  state.finishOrder = [];
  state.busy = false;
  state.over = false;

  el.result.classList.add("hidden");
  el.setup.classList.add("hidden");
  showDice(0);
  buildBoard();
  render();

  setStatus(`${playerLabel(0)}'s turn — roll the dice`);
  if (state.players[0].isAI) {
    setRollEnabled(false);
    sleep(800).then(rollDice);
  } else {
    setRollEnabled(true);
  }
}

function openSetup() {
  state.busy = false;
  state.over = true; // pause any interaction until a game starts
  setRollEnabled(false);
  el.result.classList.add("hidden");
  el.setup.classList.remove("hidden");
  renderSeats();
}

el.roll.addEventListener("click", rollDice);
el.newGame.addEventListener("click", openSetup);
el.playAgain.addEventListener("click", openSetup);
el.playerCount.addEventListener("change", renderSeats);
el.mute.addEventListener("click", () => {
  const muted = sfx.toggle();
  el.mute.textContent = muted ? "🔇 Muted" : "🔊 Sound";
  el.mute.setAttribute("aria-pressed", String(muted));
});
el.setupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const seats = [...el.seats.querySelectorAll(".seat")].map((seat) => ({
    colourIndex: Number(seat.dataset.index),
    name: seat.querySelector("input").value.trim(),
    isAI: seat.querySelector("select").value === "cpu",
  }));
  startGame(seats);
});

showDice(0);
openSetup();
