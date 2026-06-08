const STAGES = [
  { name: "Discovery", boss: "AI", bg: ["#10192d", "#1f3d66"] },
  { name: "Requirements", boss: "Dissatisfied Users", bg: ["#25142b", "#4a2872"] },
  { name: "Planning", boss: "Organizational Culture", bg: ["#1f1f12", "#4c4a1f"] },
  { name: "Developing", boss: "Faulty Middlemanagement", bg: ["#122417", "#1a5637"] },
  { name: "Testing", boss: "Legacy Bugs Hydra", bg: ["#2a1212", "#701d1d"] },
  { name: "Go Live", boss: "Scope Creep Kraken", bg: ["#10262a", "#146a75"] }
];

const POWER_UPS = [
  { name: "Developer Velocity", icon: "⚡", color: "#f7d74a", effect: "speed" },
  { name: "Stakeholder Management", icon: "🤝", color: "#7ce4ff", effect: "shield" },
  { name: "Management Back Up", icon: "🛡", color: "#8cff87", effect: "companion" },
  { name: "Additional Budget", icon: "💰", color: "#a9ff6f", effect: "heal" },
  { name: "Automated QA", icon: "🧪", color: "#f98cff", effect: "bossDamage" },
  { name: "Change Champions", icon: "📣", color: "#ffa76a", effect: "jump" }
];

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const stageNameEl = document.getElementById("stageName");
const bossNameEl = document.getElementById("bossName");
const healthEl = document.getElementById("health");
const powerupsEl = document.getElementById("powerups");
const progressEl = document.getElementById("progress");
const toggleSoundBtn = document.getElementById("toggleSound");
const saveProgressBtn = document.getElementById("saveProgress");
const resetProgressBtn = document.getElementById("resetProgress");

const keys = new Set();
const worldWidth = 2800;
const gravity = 0.55;
const baseSpeed = 3.4;
const jumpStrength = 11.8;

const player = {
  x: 80,
  y: 410,
  w: 36,
  h: 48,
  vx: 0,
  vy: 0,
  onGround: false,
  hp: 5,
  iFrames: 0
};

let gameState = {
  stageIndex: 0,
  boss: null,
  platformSeed: [],
  pickups: [],
  message: "",
  gameWon: false,
  aiCompanion: false,
  effects: { speed: 0, shield: 0, companion: 0, bossDamage: 0, jump: 0 }
};

let soundOn = true;
let audioCtx;
let bgmTimer;

const saveKey = "specman-progress-v1";

function tryLoad() {
  const saved = localStorage.getItem(saveKey);
  if (!saved) return;
  try {
    const parsed = JSON.parse(saved);
    if (typeof parsed.stageIndex === "number" && parsed.stageIndex >= 0 && parsed.stageIndex < STAGES.length) {
      gameState.stageIndex = parsed.stageIndex;
      gameState.aiCompanion = !!parsed.aiCompanion;
    }
  } catch (err) {
    console.warn("Failed to load saved progress:", err);
  }
}

function saveProgress() {
  localStorage.setItem(saveKey, JSON.stringify({ stageIndex: gameState.stageIndex, aiCompanion: gameState.aiCompanion }));
  showMessage("Progress saved to local storage.");
}

function resetProgress() {
  localStorage.removeItem(saveKey);
  gameState.stageIndex = 0;
  gameState.aiCompanion = false;
  initStage();
  showMessage("Progress reset.");
}

function showMessage(text) {
  gameState.message = text;
  setTimeout(() => {
    if (gameState.message === text) gameState.message = "";
  }, 2600);
}

function initAudio() {
  if (audioCtx) return;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) {
    soundOn = false;
    toggleSoundBtn.textContent = "Sound: OFF";
    showMessage("Audio not supported in this browser.");
    return;
  }
  try {
    audioCtx = new AudioCtor();
  } catch (err) {
    soundOn = false;
    toggleSoundBtn.textContent = "Sound: OFF";
    showMessage("Audio unavailable.");
    console.warn("Failed to initialize audio context:", err);
  }
}

function beep(freq, duration = 0.12, type = "square", gain = 0.03) {
  if (!soundOn) return;
  initAudio();
  const osc = audioCtx.createOscillator();
  const amp = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  amp.gain.value = gain;
  osc.connect(amp);
  amp.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

function startBgm() {
  if (bgmTimer) clearInterval(bgmTimer);
  const pattern = [262, 330, 392, 523, 392, 330, 294, 349, 440, 523, 587, 523, 440, 392, 330, 294];
  let i = 0;
  bgmTimer = setInterval(() => {
    if (!soundOn) return;
    beep(pattern[i % pattern.length], 0.11, "square", 0.022);
    i++;
  }, 180);
}

function makePlatforms() {
  const platforms = [];
  for (let x = 220; x < worldWidth - 260; x += 230) {
    const y = 330 + ((x / 230) % 4) * 30;
    platforms.push({ x, y, w: 140, h: 16 });
  }
  return platforms;
}

function makePickups(stageIndex) {
  const picks = [];
  for (let i = 0; i < 6; i++) {
    const p = POWER_UPS[(stageIndex + i) % POWER_UPS.length];
    picks.push({ x: 290 + i * 380, y: 240 + (i % 3) * 42, ...p, taken: false });
  }
  return picks;
}

function makeBoss(stageIndex) {
  return {
    x: worldWidth - 200,
    y: 380,
    w: 86,
    h: 90,
    hp: 10 + stageIndex * 2,
    dir: -1,
    moveTimer: 0,
    name: STAGES[stageIndex].boss
  };
}

function initStage() {
  player.x = 80;
  player.y = 410;
  player.vx = 0;
  player.vy = 0;
  player.hp = Math.max(player.hp, 3);
  gameState.effects = { speed: 0, shield: 0, companion: 0, bossDamage: 0, jump: 0 };
  gameState.platformSeed = makePlatforms();
  gameState.pickups = makePickups(gameState.stageIndex);
  gameState.boss = makeBoss(gameState.stageIndex);
}

function rectHit(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function applyPower(effect) {
  if (effect === "heal") {
    player.hp = Math.min(7, player.hp + 1);
  } else {
    gameState.effects[effect] = 600;
  }
  beep(700, 0.13, "triangle", 0.04);
}

function handleInput() {
  let speed = baseSpeed + (gameState.effects.speed > 0 ? 1.7 : 0);
  player.vx = 0;
  if (keys.has("ArrowLeft")) player.vx = -speed;
  if (keys.has("ArrowRight")) player.vx = speed;
  if (keys.has("KeyZ")) player.vx *= 1.4;
}

function physics() {
  player.x += player.vx;
  player.vy += gravity;
  player.y += player.vy;

  player.x = Math.max(0, Math.min(worldWidth - player.w, player.x));

  const floorY = 470;
  if (player.y + player.h >= floorY) {
    player.y = floorY - player.h;
    player.vy = 0;
    player.onGround = true;
  } else {
    player.onGround = false;
  }

  for (const p of gameState.platformSeed) {
    if (
      player.x + player.w > p.x &&
      player.x < p.x + p.w &&
      player.y + player.h >= p.y &&
      player.y + player.h <= p.y + 24 &&
      player.vy >= 0
    ) {
      player.y = p.y - player.h;
      player.vy = 0;
      player.onGround = true;
    }
  }
}

function hurtPlayer() {
  if (player.iFrames > 0) return;
  const protectedByShield = gameState.effects.shield > 0;
  if (!protectedByShield) player.hp -= 1;
  player.iFrames = 85;
  beep(180, 0.2, "sawtooth", 0.035);
  if (player.hp <= 0) {
    player.hp = 5;
    initStage();
    showMessage("Respawned! Keep consulting.");
  }
}

function updateBoss() {
  const boss = gameState.boss;
  boss.moveTimer++;
  if (boss.moveTimer % 90 === 0) boss.dir *= -1;
  boss.x += boss.dir * 1.7;
  boss.x = Math.max(worldWidth - 320, Math.min(worldWidth - 80, boss.x));

  if (rectHit(player, boss)) {
    hurtPlayer();
  }

  if (Math.abs((player.x + player.w / 2) - (boss.x + boss.w / 2)) < 60 && Math.abs(player.y - boss.y) < 90) {
    boss.hp -= 0.03 + (gameState.effects.bossDamage > 0 ? 0.05 : 0) + (gameState.aiCompanion || gameState.effects.companion > 0 ? 0.04 : 0);
  }

  if (boss.hp <= 0) {
    beep(950, 0.18, "triangle", 0.05);
    if (gameState.stageIndex === 0) {
      gameState.aiCompanion = true;
      showMessage("AI defeated and now your companion!");
    }
    if (gameState.stageIndex < STAGES.length - 1) {
      gameState.stageIndex++;
      saveProgress();
      initStage();
      showMessage(`Stage cleared! Welcome to ${STAGES[gameState.stageIndex].name}.`);
    } else {
      gameState.gameWon = true;
      saveProgress();
      showMessage("Go Live complete! SpecMan wins!");
    }
  }
}

function updatePickups() {
  for (const p of gameState.pickups) {
    if (!p.taken && rectHit(player, { x: p.x, y: p.y, w: 24, h: 24 })) {
      p.taken = true;
      applyPower(p.effect);
      showMessage(`Power-Up: ${p.name}`);
    }
  }
}

function tickEffects() {
  for (const key of Object.keys(gameState.effects)) {
    if (gameState.effects[key] > 0) gameState.effects[key]--;
  }
  if (player.iFrames > 0) player.iFrames--;
}

function drawPixelSprite(x, y, scale, pixels, on, off = "transparent") {
  for (let row = 0; row < pixels.length; row++) {
    for (let col = 0; col < pixels[row].length; col++) {
      ctx.fillStyle = pixels[row][col] === "1" ? on : off;
      if (pixels[row][col] !== "0" || off !== "transparent") {
        ctx.fillRect(x + col * scale, y + row * scale, scale, scale);
      }
    }
  }
}

function drawBackground() {
  const stage = STAGES[gameState.stageIndex];
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, stage.bg[0]);
  g.addColorStop(1, stage.bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const camX = Math.max(0, Math.min(worldWidth - canvas.width, player.x - 220));

  for (let i = 0; i < 25; i++) {
    ctx.fillStyle = i % 2 ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.06)";
    ctx.fillRect(((i * 140 - camX * 0.35) % 1100) + 20, 80 + (i % 6) * 30, 22, 10);
  }

  ctx.fillStyle = "#21342e";
  ctx.fillRect(0, 470, canvas.width, 70);

  return camX;
}

function drawWorld(camX) {
  for (const p of gameState.platformSeed) {
    const x = p.x - camX;
    ctx.fillStyle = "#705432";
    ctx.fillRect(x, p.y, p.w, p.h);
    ctx.fillStyle = "#9c7f49";
    ctx.fillRect(x, p.y, p.w, 5);
  }

  for (const p of gameState.pickups) {
    if (p.taken) continue;
    const x = p.x - camX;
    ctx.fillStyle = p.color;
    ctx.fillRect(x, p.y, 24, 24);
    ctx.fillStyle = "#000";
    ctx.font = "16px monospace";
    ctx.fillText(p.icon, x + 2, p.y + 18);
  }

  const boss = gameState.boss;
  const bx = boss.x - camX;
  drawPixelSprite(
    bx,
    boss.y,
    6,
    ["00111100", "01100110", "11011011", "11111111", "10111101", "00100100"],
    "#f15b5b",
    "transparent"
  );
  ctx.fillStyle = "#fff";
  ctx.font = "12px monospace";
  ctx.fillText(`${boss.name} HP: ${Math.max(0, boss.hp).toFixed(1)}`, bx - 10, boss.y - 10);

  const px = player.x - camX;
  const bodyColor = player.iFrames > 0 ? "#f7d74a" : "#6bdcff";
  drawPixelSprite(
    px,
    player.y,
    6,
    ["001100", "011110", "111111", "011110", "011110", "110011", "110011", "010010"],
    bodyColor,
    "transparent"
  );

  if (gameState.aiCompanion || gameState.effects.companion > 0) {
    drawPixelSprite(px - 28, player.y + 10, 4, ["0110", "1111", "1111", "0110"], "#b5a4ff", "transparent");
  }
}

function drawOverlay() {
  if (gameState.message) {
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillRect(220, 20, 520, 36);
    ctx.fillStyle = "#fff";
    ctx.font = "16px monospace";
    ctx.fillText(gameState.message, 236, 44);
  }

  if (gameState.gameWon) {
    ctx.fillStyle = "rgba(0,0,0,.8)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#9fffd8";
    ctx.font = "34px monospace";
    ctx.fillText("SPECMAN - GO LIVE ACHIEVED", 130, 220);
    ctx.font = "18px monospace";
    ctx.fillText("Refresh to replay from saved progress.", 275, 270);
  }
}

function updateHud() {
  const stage = STAGES[gameState.stageIndex];
  stageNameEl.textContent = stage.name;
  bossNameEl.textContent = stage.boss;
  healthEl.textContent = `${"█".repeat(player.hp)} (${player.hp})`;

  const active = Object.entries(gameState.effects)
    .filter(([, v]) => v > 0)
    .map(([k]) => k)
    .join(", ");
  powerupsEl.textContent = active || "none";
  progressEl.textContent = `${gameState.stageIndex + 1}/${STAGES.length}`;
}

function loop() {
  if (!gameState.gameWon) {
    handleInput();
    physics();
    updatePickups();
    updateBoss();
    tickEffects();
  }

  const camX = drawBackground();
  drawWorld(camX);
  drawOverlay();
  updateHud();
  requestAnimationFrame(loop);
}

document.addEventListener("keydown", (e) => {
  if (["ArrowLeft", "ArrowRight", "Space", "KeyZ", "KeyM", "KeyP"].includes(e.code)) e.preventDefault();

  if (e.code === "Space" && player.onGround && !gameState.gameWon) {
    const jumpBoost = gameState.effects.jump > 0 ? 2.4 : 0;
    player.vy = -(jumpStrength + jumpBoost);
    beep(520, 0.08, "square", 0.03);
  }

  if (e.code === "KeyM") {
    soundOn = !soundOn;
    toggleSoundBtn.textContent = `Sound: ${soundOn ? "ON" : "OFF"}`;
  }

  if (e.code === "KeyP") saveProgress();

  keys.add(e.code);
});

document.addEventListener("keyup", (e) => keys.delete(e.code));

toggleSoundBtn.addEventListener("click", () => {
  soundOn = !soundOn;
  toggleSoundBtn.textContent = `Sound: ${soundOn ? "ON" : "OFF"}`;
});
saveProgressBtn.addEventListener("click", saveProgress);
resetProgressBtn.addEventListener("click", resetProgress);

tryLoad();
initStage();
startBgm();
showMessage("Welcome Integration Consultant. Stage 1: Discovery");
loop();
