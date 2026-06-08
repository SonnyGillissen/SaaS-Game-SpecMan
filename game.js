// ================================================================
// SPECMAN  –  Retro Integration Platformer
// ================================================================

// ── DATA ────────────────────────────────────────────────────────
const STAGES = [
  { name:"Discovery",     boss:"AI",                      bg:["#0a1628","#1a3d6e"], theme:"tech"   },
  { name:"Requirements",  boss:"Dissatisfied Users",      bg:["#1e0b28","#4a1e72"], theme:"purple" },
  { name:"Planning",      boss:"Organizational Culture",  bg:["#1c1b0a","#4c4a1a"], theme:"desert" },
  { name:"Developing",    boss:"Faulty Middlemanagement", bg:["#0a1e12","#1a5637"], theme:"jungle" },
  { name:"Testing",       boss:"Legacy Bugs Hydra",       bg:["#220a0a","#6a1a1a"], theme:"cave"   },
  { name:"Go Live",       boss:"Scope Creep Kraken",      bg:["#081c22","#106070"], theme:"ocean"  }
];

const POWER_UPS = [
  { name:"Developer Velocity",     icon:"\u26a1", color:"#f7d74a", effect:"speed"      },
  { name:"Stakeholder Management", icon:"\ud83e\udd1d", color:"#7ce4ff", effect:"shield"     },
  { name:"Management Back Up",     icon:"\ud83d\udee1",  color:"#8cff87", effect:"companion"  },
  { name:"Additional Budget",      icon:"\ud83d\udcb0", color:"#a9ff6f", effect:"heal"       },
  { name:"Automated QA",           icon:"\ud83e\uddea", color:"#f98cff", effect:"bossDamage" },
  { name:"Change Champions",       icon:"\ud83d\udce3", color:"#ffa76a", effect:"jump"       }
];

// ── DOM ──────────────────────────────────────────────────────────
const canvas          = document.getElementById("game");
const ctx             = canvas.getContext("2d");
const stageNameEl     = document.getElementById("stageName");
const bossNameEl      = document.getElementById("bossName");
const healthEl        = document.getElementById("health");
const powerupsEl      = document.getElementById("powerups");
const progressEl      = document.getElementById("progress");
const toggleSoundBtn  = document.getElementById("toggleSound");
const saveProgressBtn = document.getElementById("saveProgress");
const resetProgressBtn= document.getElementById("resetProgress");

// ── CONSTANTS ────────────────────────────────────────────────────
const WORLD_W            = 2800;
const FLOOR_Y            = 470;
const GRAVITY            = 0.55;
const BASE_SPEED         = 3.4;
const JUMP_STR           = 11.8;
const MAX_HP             = 7;
const BASE_BOSS_DAMAGE   = 0.03;
const POWERUP_BOSS_BONUS = 0.05;
const COMPANION_BONUS    = 0.04;
const GAME_CONTROL_KEYS  = ["ArrowLeft","ArrowRight","Space","KeyY","KeyM","KeyP"];

// ── STATE ────────────────────────────────────────────────────────
const keys = new Set();

const player = {
  x:80, y:410, w:30, h:48,
  vx:0, vy:0,
  onGround:false,
  hp:5, iFrames:0,
  facing:1,
  walkTick:0,
  dashFrames:0,
  dashCooldown:0
};

let gameState = {
  stageIndex:0,
  boss:null,
  platforms:[],
  pickups:[],
  minions:[],
  message:"",
  gameWon:false,
  aiCompanion:false,
  effects:{ speed:0, shield:0, companion:0, bossDamage:0, jump:0 }
};

let soundOn = true;
let audioCtx, bgmTimer;
const saveKey = "specman-progress-v2";

// ── SAVE / LOAD ──────────────────────────────────────────────────
function tryLoad() {
  const saved = localStorage.getItem(saveKey);
  if (!saved) return;
  try {
    const p = JSON.parse(saved);
    if (p && typeof p === "object" && typeof p.stageIndex === "number" && p.stageIndex >= 0 && p.stageIndex < STAGES.length) {
      gameState.stageIndex = p.stageIndex;
      gameState.aiCompanion = typeof p.aiCompanion === "boolean" ? p.aiCompanion : false;
    }
  } catch (err) { console.warn("Failed to load save:", err); }
}

function saveProgress() {
  localStorage.setItem(saveKey, JSON.stringify({
    stageIndex:  gameState.stageIndex,
    aiCompanion: gameState.aiCompanion
  }));
  showMessage("Progress saved!");
}

function resetProgress() {
  localStorage.removeItem(saveKey);
  gameState.stageIndex = 0;
  gameState.aiCompanion = false;
  initStage();
  showMessage("Progress reset.");
}

// ── AUDIO ────────────────────────────────────────────────────────
function initAudio() {
  if (audioCtx) return;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) {
    soundOn = false;
    toggleSoundBtn.textContent = "\u266a SND OFF";
    return;
  }
  try {
    audioCtx = new AudioCtor();
  } catch (err) {
    soundOn = false;
    toggleSoundBtn.textContent = "\u266a SND OFF";
    console.warn("Audio init failed:", err);
  }
}

function beep(freq, duration=0.12, type="square", gain=0.03) {
  if (!soundOn) return;
  initAudio();
  if (!audioCtx) return;
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
  // Soft ambient loop: pentatonic descending/ascending phrase in C major
  const pattern = [0,523,0,440,392,0,440,523,0,392,329,0,329,392,0,523];
  let i = 0;
  bgmTimer = setInterval(() => {
    if (!soundOn) return;
    const note = pattern[i % pattern.length];
    if (note > 0) beep(note, 0.18, "sine", 0.012);
    i++;
  }, 300);
}

// ── MESSAGES ─────────────────────────────────────────────────────
function showMessage(text) {
  gameState.message = text;
  setTimeout(() => { if (gameState.message === text) gameState.message = ""; }, 2600);
}

// ── WORLD GENERATION ─────────────────────────────────────────────
function makePlatforms(si) {
  const list = [];
  for (let x = 260; x < WORLD_W - 300; x += 230 + (si * 12 % 50)) {
    const y = 300 + (Math.floor(x / 115) % 5) * 30;
    list.push({ x, y, w:120 + (si % 3)*16, h:16, type:"brick" });
  }
  return list;
}

function makePickups(si) {
  return Array.from({ length:6 }, (_, i) => {
    const p = POWER_UPS[(si + i) % POWER_UPS.length];
    return { x:300 + i*400, y:188 + (i%3)*44, ...p, taken:false };
  });
}

function makeBoss(si) {
  return {
    x:WORLD_W - 200, y:FLOOR_Y - 90,
    w:80, h:90,
    hp:10 + si*2, dir:-1, moveTimer:0,
    name:STAGES[si].boss
  };
}

function makeMinions(si) {
  const types = ["gremlin","caller","blocker"];
  return Array.from({ length:10 }, (_, i) => {
    const sx = 260 + i * 260;
    return {
      x:sx, y:FLOOR_Y - 26,
      w:26, h:26,
      dir: i % 2 === 0 ? 1 : -1,
      patrolMin: sx - 90,
      patrolMax: sx + 90,
      speed: 1.2 + si * 0.08,
      type: types[(si + i) % types.length],
      alive: true,
      stompFlash: 0
    };
  });
}

function initStage() {
  player.x = 80; player.y = 410;
  player.vx = 0; player.vy = 0;
  player.hp = Math.max(player.hp, 3);
  player.walkTick = 0;
  player.dashFrames = 0; player.dashCooldown = 0;
  gameState.effects   = { speed:0, shield:0, companion:0, bossDamage:0, jump:0 };
  gameState.platforms = makePlatforms(gameState.stageIndex);
  gameState.pickups   = makePickups(gameState.stageIndex);
  gameState.boss      = makeBoss(gameState.stageIndex);
  gameState.minions   = makeMinions(gameState.stageIndex);
}

// ── HELPERS ──────────────────────────────────────────────────────
function rectHit(a, b) {
  return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
}

function getCamX() {
  return Math.max(0, Math.min(WORLD_W - canvas.width, player.x - 220));
}

// ── INPUT / PHYSICS ──────────────────────────────────────────────
function handleInput() {
  const speed = BASE_SPEED + (gameState.effects.speed > 0 ? 1.7 : 0);
  player.vx = 0;
  if (keys.has("ArrowLeft"))  { player.vx = -speed; player.facing = -1; }
  if (keys.has("ArrowRight")) { player.vx =  speed; player.facing =  1; }
  if (player.dashFrames > 0) {
    player.vx = player.facing * (BASE_SPEED * 3.5 + (gameState.effects.speed > 0 ? 2.5 : 0));
  }
}

function physics() {
  player.x += player.vx;
  player.vy += GRAVITY;
  player.y += player.vy;
  player.x = Math.max(0, Math.min(WORLD_W - player.w, player.x));

  if (player.y + player.h >= FLOOR_Y) {
    player.y = FLOOR_Y - player.h; player.vy = 0; player.onGround = true;
  } else {
    player.onGround = false;
  }

  for (const p of gameState.platforms) {
    if (
      player.x + player.w > p.x && player.x < p.x + p.w &&
      player.y + player.h >= p.y && player.y + player.h <= p.y + 24 &&
      player.vy >= 0
    ) {
      player.y = p.y - player.h; player.vy = 0; player.onGround = true;
    }
  }

  if (player.onGround && player.vx !== 0) player.walkTick++;
  else if (player.onGround) player.walkTick = 0;
}

// ── POWER-UPS ────────────────────────────────────────────────────
function applyPower(effect) {
  if (effect === "heal") player.hp = Math.min(MAX_HP, player.hp + 1);
  else gameState.effects[effect] = 600;
  beep(700, 0.13, "triangle", 0.04);
}

function updatePickups() {
  for (const p of gameState.pickups) {
    if (!p.taken && rectHit(player, { x:p.x, y:p.y, w:28, h:28 })) {
      p.taken = true; applyPower(p.effect);
      showMessage("Power-Up: " + p.name);
    }
  }
}

// ── MINIONS ──────────────────────────────────────────────────────
function updateMinions() {
  for (const m of gameState.minions) {
    if (!m.alive) { if (m.stompFlash > 0) m.stompFlash--; continue; }
    m.x += m.dir * m.speed;
    if (m.x <= m.patrolMin || m.x >= m.patrolMax) m.dir *= -1;

    const stomped =
      player.vy > 0 &&
      player.x + player.w > m.x + 4 && player.x < m.x + m.w - 4 &&
      player.y + player.h >= m.y && player.y + player.h <= m.y + 14;

    if (stomped) {
      m.alive = false; m.stompFlash = 22;
      player.vy = -7.5;
      beep(660, 0.1, "triangle", 0.04);
    } else if (rectHit(player, m)) {
      hurtPlayer();
    }
  }
}

// ── BOSS / HURT ──────────────────────────────────────────────────
function hurtPlayer() {
  if (player.iFrames > 0) return;
  if (player.dashFrames > 0) return;
  if (gameState.effects.shield <= 0) player.hp -= 1;
  player.iFrames = 85;
  beep(180, 0.2, "sawtooth", 0.035);
  if (player.hp <= 0) {
    player.hp = 5; initStage();
    showMessage("Respawned! Keep consulting.");
  }
}

function updateBoss() {
  const boss = gameState.boss;
  boss.moveTimer++;
  if (boss.moveTimer % 90 === 0) boss.dir *= -1;
  boss.x += boss.dir * 1.7;
  boss.x = Math.max(WORLD_W - 320, Math.min(WORLD_W - 80, boss.x));

  if (rectHit(player, boss)) hurtPlayer();

  const cx = player.x + player.w / 2;
  const bx = boss.x  + boss.w  / 2;
  if (Math.abs(cx - bx) < 60 && Math.abs(player.y - boss.y) < 90) {
    const dmg = BASE_BOSS_DAMAGE
      + (gameState.effects.bossDamage > 0 ? POWERUP_BOSS_BONUS : 0)
      + ((gameState.aiCompanion || gameState.effects.companion > 0) ? COMPANION_BONUS : 0);
    boss.hp -= dmg;
  }

  if (boss.hp <= 0) {
    beep(950, 0.18, "triangle", 0.05);
    if (gameState.stageIndex === 0) {
      gameState.aiCompanion = true;
      showMessage("AI defeated \u2014 now your companion!");
    }
    if (gameState.stageIndex < STAGES.length - 1) {
      gameState.stageIndex++;
      saveProgress();
      initStage();
      showMessage("Stage cleared! Welcome to " + STAGES[gameState.stageIndex].name + ".");
    } else {
      gameState.gameWon = true;
      saveProgress();
    }
  }
}

function tickEffects() {
  for (const k of Object.keys(gameState.effects)) {
    if (gameState.effects[k] > 0) gameState.effects[k]--;
  }
  if (player.iFrames > 0) player.iFrames--;
  if (player.dashFrames > 0) player.dashFrames--;
  if (player.dashCooldown > 0) player.dashCooldown--;
}

// ================================================================
// DRAWING
// ================================================================

// ── BACKGROUND ──────────────────────────────────────────────────
function drawBackground(camX) {
  const stage = STAGES[gameState.stageIndex];
  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, stage.bg[0]);
  sky.addColorStop(1, stage.bg[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawMountains(camX * 0.2, stage);
  drawClouds(camX * 0.35, stage);
  drawGround(stage);
}

function drawMountains(px, stage) {
  const theme = stage.theme;
  const c1 = theme==="desert"?"#5a4020":theme==="jungle"?"#1a4020":theme==="cave"?"#2a1a2a":theme==="ocean"?"#0a2030":"#1a2a4a";
  const c2 = theme==="desert"?"#7a5530":theme==="jungle"?"#2a5030":theme==="cave"?"#3a2a3a":theme==="ocean"?"#1a3040":"#2a3a5a";
  for (let i = 0; i < 14; i++) {
    const mx = ((i*230 - px) % 1460 + 1460) % 1460 - 80;
    const mw = 180 + (i%3)*40;
    const mh = 120 + (i%4)*30;
    ctx.fillStyle = i%2===0 ? c1 : c2;
    ctx.beginPath();
    ctx.moveTo(mx,         FLOOR_Y - 30);
    ctx.lineTo(mx + mw/2,  FLOOR_Y - 30 - mh);
    ctx.lineTo(mx + mw,    FLOOR_Y - 30);
    ctx.closePath();
    ctx.fill();
  }
}

function drawClouds(px, stage) {
  const theme = stage.theme;
  const col = theme==="cave"?"rgba(80,60,80,.45)":theme==="ocean"?"rgba(150,220,255,.22)":"rgba(255,255,255,.16)";
  for (let i = 0; i < 16; i++) {
    const cx = ((i*175 + 40 - px) % 1260 + 1260) % 1260 - 80;
    const cy = 30 + (i%5)*28;
    const cw = 80 + (i%4)*18;
    const ch = 22 + (i%3)*7;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(cx+cw*.5,  cy+ch*.5,  cw*.5,  ch*.5,  0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx+cw*.28, cy+ch*.28, cw*.28, ch*.55, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx+cw*.74, cy+ch*.38, cw*.24, ch*.5,  0, 0, Math.PI*2); ctx.fill();
  }
}

function drawGround(stage) {
  const theme = stage.theme;
  const dirt  = theme==="desert"?"#7a5022":theme==="cave"?"#3a2a1a":theme==="ocean"?"#1a3a2a":"#4a2e10";
  const grass = theme==="desert"?"#c8a040":theme==="cave"?"#5a3a5a":theme==="ocean"?"#2a8a4a":theme==="jungle"?"#3ab844":"#4ecf3a";
  ctx.fillStyle = dirt;
  ctx.fillRect(0, FLOOR_Y, canvas.width, canvas.height - FLOOR_Y);
  ctx.fillStyle = grass;
  ctx.fillRect(0, FLOOR_Y, canvas.width, 10);
  ctx.fillStyle = "rgba(0,0,0,.12)";
  for (let gx = 0; gx < canvas.width; gx += 16) ctx.fillRect(gx, FLOOR_Y+10, 1, canvas.height);
  ctx.fillRect(0, FLOOR_Y+26, canvas.width, 1);
  ctx.fillRect(0, FLOOR_Y+43, canvas.width, 1);
}

// ── DECORATIONS ──────────────────────────────────────────────────
function drawDecorations(camX) {
  const theme = STAGES[gameState.stageIndex].theme;

  if (theme === "tech" || theme === "ocean") {
    for (let i = 0; i < 8; i++) {
      const x = (160 + i*340) - camX;
      if (x + 36 < 0 || x > canvas.width) continue;
      const y = FLOOR_Y - 48;
      ctx.fillStyle = "#1a7a1a"; ctx.fillRect(x+4, y+16, 28, 32);
      ctx.fillStyle = "#2aaa2a"; ctx.fillRect(x, y, 36, 18);
      ctx.fillStyle = "#3acc3a"; ctx.fillRect(x+4, y+18, 5, 30); ctx.fillRect(x+3, y+2, 8, 8);
      ctx.fillStyle = "#0a500a"; ctx.fillRect(x, y, 3, 48); ctx.fillRect(x+33, y, 3, 48);
    }
  }

  if (theme === "jungle" || theme === "desert") {
    const trunkCol = theme==="desert" ? "#8a6a30" : "#6a3a10";
    const leafCol  = theme==="desert" ? "#d4c040" : "#1a8a20";
    const leaf2Col = theme==="desert" ? "#ffe060" : "#2ab430";
    for (let i = 0; i < 8; i++) {
      const x = (140 + i*320) - camX;
      if (x + 50 < 0 || x > canvas.width) continue;
      ctx.fillStyle = trunkCol; ctx.fillRect(x+15, FLOOR_Y-50, 10, 50);
      ctx.fillStyle = leafCol;
      ctx.beginPath(); ctx.arc(x+20, FLOOR_Y-62, 22, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(x+6,  FLOOR_Y-52, 14, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(x+34, FLOOR_Y-52, 14, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = leaf2Col;
      ctx.beginPath(); ctx.arc(x+14, FLOOR_Y-70, 8, 0, Math.PI*2); ctx.fill();
    }
  }

  if (theme === "purple" || theme === "cave") {
    const bCol1 = theme==="purple" ? "#3a1a6a" : "#2a1a4a";
    const bCol2 = theme==="purple" ? "#5a2a9a" : "#4a2a7a";
    for (let i = 0; i < 8; i++) {
      const x = (100 + i*300) - camX;
      if (x + 60 < 0 || x > canvas.width) continue;
      ctx.fillStyle = bCol1;
      ctx.beginPath(); ctx.ellipse(x+30, FLOOR_Y-12, 28, 18, 0, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x+14, FLOOR_Y-8,  16, 13, 0, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x+46, FLOOR_Y-8,  16, 13, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = bCol2;
      ctx.beginPath(); ctx.ellipse(x+22, FLOOR_Y-18, 10, 8, 0, 0, Math.PI*2); ctx.fill();
    }
  }
}

// ── PLATFORMS ────────────────────────────────────────────────────
function drawPlatforms(camX) {
  ctx.textAlign = "center";
  for (const p of gameState.platforms) {
    const x = p.x - camX;
    if (x + p.w < 0 || x > canvas.width) continue;
    ctx.fillStyle = "#8a4a18"; ctx.fillRect(x, p.y, p.w, p.h);
    ctx.fillStyle = "#b06030"; ctx.fillRect(x, p.y, p.w, 4);
    ctx.fillStyle = "#601a04";
    for (let bx = 0; bx < p.w; bx += 20) ctx.fillRect(x+bx, p.y, 1, p.h);
    ctx.fillRect(x, p.y + Math.floor(p.h/2), p.w, 1);
  }
  ctx.textAlign = "left";
}

// ── PICKUPS ──────────────────────────────────────────────────────
function drawPickups(camX) {
  const t = Date.now() / 800;
  for (const p of gameState.pickups) {
    if (p.taken) continue;
    const x = p.x - camX;
    if (x+30 < 0 || x > canvas.width) continue;
    const bob = Math.sin(t + p.x*0.018) * 3;
    const py = p.y + bob;
    ctx.fillStyle = p.color;             ctx.fillRect(x, py, 28, 28);
    ctx.fillStyle = "rgba(255,255,255,.32)"; ctx.fillRect(x+2, py+2, 24, 7);
    ctx.fillStyle = "rgba(0,0,0,.18)";   ctx.fillRect(x, py+25, 28, 3);
    ctx.font = "17px monospace"; ctx.fillStyle = "#000";
    ctx.fillText(p.icon, x+3, py+20);
  }
}

// ── PLAYER ───────────────────────────────────────────────────────
function drawPlayer(camX) {
  const sx = player.x - camX;
  const sy = player.y;

  if (player.iFrames > 0 && Math.floor(player.iFrames/5)%2 === 0) return;

  const wf   = Math.floor(player.walkTick/7) % 4;
  const flip = player.facing === -1;

  ctx.save();
  if (flip) { ctx.translate(sx + player.w, 0); ctx.scale(-1, 1); }
  else       { ctx.translate(sx, 0); }

  // Hat
  ctx.fillStyle = "#1a1a3e";
  ctx.fillRect(4,  sy,   22, 6);
  ctx.fillRect(1,  sy+5, 28, 5);

  // Head
  ctx.fillStyle = "#ffb87e";
  ctx.fillRect(4, sy+10, 22, 14);

  // Eyes
  ctx.fillStyle = "#1a0a00";
  ctx.fillRect(8,  sy+14, 4, 4);
  ctx.fillRect(18, sy+14, 4, 4);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(9,  sy+15, 2, 2);
  ctx.fillRect(19, sy+15, 2, 2);

  // Collar
  ctx.fillStyle = "#f8f4ef";
  ctx.fillRect(9,  sy+23, 3, 5);
  ctx.fillRect(18, sy+23, 3, 5);

  // Suit body
  ctx.fillStyle = "#1a3a80";
  ctx.fillRect(2, sy+22, 26, 20);

  // Tie
  ctx.fillStyle = "#cc2200";
  ctx.fillRect(12, sy+22, 6, 12);
  ctx.fillRect(11, sy+30, 8, 5);

  // Lapel shadow
  ctx.fillStyle = "#102a60";
  ctx.fillRect(2, sy+22, 8, 20);

  // Left arm
  ctx.fillStyle = "#1a3a80";
  ctx.fillRect(0, sy+27, 4, 8);

  // Right arm + briefcase
  ctx.fillRect(26, sy+27, 4, 8);
  ctx.fillStyle = "#8b5533"; ctx.fillRect(27, sy+33, 12, 8);
  ctx.fillStyle = "#6a3a20"; ctx.fillRect(30, sy+30, 5,  4);
  ctx.fillStyle = "#c07040"; ctx.fillRect(28, sy+37, 10, 1);

  // Legs (animated)
  ctx.fillStyle = "#0d2646";
  const legY = sy + 42;
  if (wf === 0 || wf === 2) {
    ctx.fillRect(5,  legY,     9, 14);
    ctx.fillRect(16, legY,     9, 14);
  } else if (wf === 1) {
    ctx.fillRect(3,  legY,     9, 14);
    ctx.fillRect(18, legY - 2, 9, 12);
  } else {
    ctx.fillRect(5,  legY - 2, 9, 12);
    ctx.fillRect(20, legY,     9, 14);
  }

  // Shoes
  ctx.fillStyle = "#111827";
  if (wf === 0 || wf === 2) {
    ctx.fillRect(3,  legY+13, 13, 5);
    ctx.fillRect(14, legY+13, 13, 5);
  } else if (wf === 1) {
    ctx.fillRect(1,  legY+13, 14, 5);
    ctx.fillRect(16, legY+ 9, 12, 5);
  } else {
    ctx.fillRect(4,  legY+ 9, 12, 5);
    ctx.fillRect(19, legY+13, 14, 5);
  }

  ctx.restore();

  // AI companion (drawn in screen space, always left of player)
  if (gameState.aiCompanion || gameState.effects.companion > 0) {
    drawAICompanion(sx - 36, sy + 8);
  }
}

function drawAICompanion(x, y) {
  const bob = Math.round(Math.sin(Date.now()/300) * 2);
  ctx.fillStyle = "#6677ee"; ctx.fillRect(x+2,  y+bob,    16, 12);
  ctx.fillStyle = "#aabbff"; ctx.fillRect(x+3,  y+2+bob,   4,  4); ctx.fillRect(x+11, y+2+bob,  4, 4);
  ctx.fillStyle = "#4455cc"; ctx.fillRect(x+4,  y+4+bob,   2,  2); ctx.fillRect(x+12, y+4+bob,  2, 2);
  ctx.fillStyle = "#5566dd"; ctx.fillRect(x+3,  y+12+bob, 14, 10);
  ctx.fillStyle = "#4455cc";
  ctx.fillRect(x,    y+13+bob, 3,  6);
  ctx.fillRect(x+17, y+13+bob, 3,  6);
  ctx.fillRect(x+5,  y+22+bob, 4,  5);
  ctx.fillRect(x+11, y+22+bob, 4,  5);
}

// ── MINION SPRITES ───────────────────────────────────────────────
function drawMinions(camX) {
  for (const m of gameState.minions) {
    const x = m.x - camX;
    if (x+m.w < -10 || x > canvas.width+10) continue;

    if (!m.alive) {
      if (m.stompFlash > 0) {
        const f = m.stompFlash;
        ctx.fillStyle = "#ffff00";
        ctx.fillRect(x+m.w/2-2, m.y-f*0.7,   4, 4);
        ctx.fillRect(x+m.w/2-9, m.y-f*0.45,  4, 4);
        ctx.fillRect(x+m.w/2+5, m.y-f*0.45,  4, 4);
        ctx.fillRect(x+m.w/2-2, m.y-f*0.25,  4, 4);
      }
      continue;
    }
    if (m.type === "gremlin") drawGremlin(x, m.y, m.dir);
    else if (m.type === "caller") drawCaller(x, m.y, m.dir);
    else drawBlocker(x, m.y, m.dir);
  }
}

function drawGremlin(x, y, dir) {
  ctx.fillStyle = "#f0e8d0"; ctx.fillRect(x, y-16, 26, 16);
  ctx.fillStyle = "#e05830";
  ctx.beginPath(); ctx.moveTo(x,y-16); ctx.lineTo(x+13,y-8); ctx.lineTo(x+26,y-16); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#c04020"; ctx.fillRect(x+3,y-14,6,1); ctx.fillRect(x+3,y-11,10,1);
  const ex = dir>0 ? x+17 : x+5;
  ctx.fillStyle = "#1a0000"; ctx.fillRect(ex, y-13, 4, 4);
  ctx.fillStyle = "#ff4444"; ctx.fillRect(ex+1, y-12, 2, 2);
  ctx.fillStyle = "#e05830"; ctx.fillRect(x+3, y, 20, 14);
  ctx.fillStyle = "#c04020"; ctx.fillRect(x+5, y+12, 5, 8); ctx.fillRect(x+16, y+12, 5, 8);
  ctx.fillStyle = "#803010"; ctx.fillRect(x+3, y+18, 9, 4); ctx.fillRect(x+14, y+18, 9, 4);
}

function drawCaller(x, y, dir) {
  ctx.fillStyle = "#ffa06a"; ctx.fillRect(x+3, y-14, 18, 14);
  ctx.fillStyle = "#ffffff"; ctx.fillRect(x+5, y-11, 6, 5); ctx.fillRect(x+13, y-11, 6, 5);
  ctx.fillStyle = "#3333cc"; ctx.fillRect(x+6, y-10, 4, 3); ctx.fillRect(x+14, y-10, 4, 3);
  ctx.fillStyle = "#aa3300"; ctx.fillRect(x+5, y-13, 6, 2); ctx.fillRect(x+13, y-13, 6, 2);
  ctx.fillStyle = "#4060cc"; ctx.fillRect(x+2, y, 22, 14);
  const px = dir>0 ? x+22 : x-6;
  ctx.fillStyle = "#222222"; ctx.fillRect(px, y-10, 6, 10);
  ctx.fillStyle = "#4488ff"; ctx.fillRect(px+1, y-9, 4, 6);
  ctx.fillStyle = "#3050aa"; ctx.fillRect(x+4, y+13, 5, 7); ctx.fillRect(x+15, y+13, 5, 7);
  ctx.fillStyle = "#111827"; ctx.fillRect(x+2, y+18, 9, 4); ctx.fillRect(x+13, y+18, 9, 4);
}

function drawBlocker(x, y, dir) {
  ctx.fillStyle = "#b0b010"; ctx.fillRect(x, y-6, 30, 24);
  ctx.fillStyle = "#909000"; ctx.fillRect(x, y-6, 30, 2); ctx.fillRect(x+15, y-6, 1, 12);
  ctx.fillRect(x, y+6, 15, 1); ctx.fillRect(x+15, y+7, 1, 12);
  ctx.fillStyle = "#ff4400"; ctx.fillRect(x+4, y-2, 8, 6); ctx.fillRect(x+18, y-2, 8, 6);
  ctx.fillStyle = "#ffaa00"; ctx.fillRect(x+6, y, 4, 2); ctx.fillRect(x+20, y, 4, 2);
  ctx.fillStyle = "#8a8000"; ctx.fillRect(x+8, y+10, 14, 4);
  ctx.fillStyle = "#808008"; ctx.fillRect(x+4, y+18, 8, 8); ctx.fillRect(x+18, y+18, 8, 8);
}

// ── BOSS SPRITES ─────────────────────────────────────────────────
function drawBoss(camX) {
  const boss = gameState.boss;
  const x = boss.x - camX;
  const y = boss.y;
  if (x+boss.w < -20 || x > canvas.width+20) return;
  const t = Date.now() / 300;
  switch (gameState.stageIndex) {
    case 0: drawBossAI(x,y,t);               break;
    case 1: drawBossUsers(x,y,t);            break;
    case 2: drawBossOrgCulture(x,y,t);       break;
    case 3: drawBossMiddleManagement(x,y,t); break;
    case 4: drawBossHydra(x,y,t);            break;
    case 5: drawBossKraken(x,y,t);           break;
  }
  const maxHp = 10 + gameState.stageIndex*2;
  const pct   = Math.max(0, boss.hp / maxHp);
  ctx.fillStyle = "#400"; ctx.fillRect(x-10, y-22, boss.w+20, 8);
  ctx.fillStyle = pct > 0.5 ? "#0f0" : pct > 0.25 ? "#fa0" : "#f00";
  ctx.fillRect(x-10, y-22, (boss.w+20)*pct, 8);
  ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(x-10, y-22, boss.w+20, 2);
  ctx.fillStyle = "#fff"; ctx.font = "bold 13px monospace";
  ctx.strokeStyle = "rgba(0,0,0,.9)"; ctx.lineWidth = 3;
  ctx.strokeText(boss.name, x-10, y-26);
  ctx.fillText(boss.name, x-10, y-26);
}

function drawBossAI(x,y,t) {
  const b = Math.round(Math.sin(t)*3);
  ctx.fillStyle = "#2233aa"; ctx.fillRect(x+12, y+76+b, 18,14); ctx.fillRect(x+50, y+76+b, 18,14);
  ctx.fillStyle = "#4455bb"; ctx.fillRect(x+10, y+88+b, 22, 6); ctx.fillRect(x+48, y+88+b, 22, 6);
  ctx.fillStyle = "#3344aa"; ctx.fillRect(x+5, y+30+b, 70,48);
  ctx.fillStyle = "#2233cc"; ctx.fillRect(x+12,y+36+b,12,6); ctx.fillRect(x+30,y+36+b,12,6); ctx.fillRect(x+48,y+36+b,12,6);
  ctx.fillStyle = "#4455bb"; ctx.fillRect(x-12,y+34+b,18,8); ctx.fillRect(x+74,y+34+b,18,8);
  ctx.fillStyle = "#6677dd"; ctx.fillRect(x-16,y+28+b,8,18); ctx.fillRect(x+88,y+28+b,8,18);
  ctx.fillStyle = "#2233cc"; ctx.fillRect(x,y+b,80,32);
  ctx.fillStyle = "#4455dd"; ctx.fillRect(x+2,y+1+b,76,4);
  ctx.fillStyle = "#001200"; ctx.fillRect(x+6,y+4+b,68,22);
  ctx.fillStyle = "#00dd44"; ctx.font = "9px monospace";
  ctx.fillText("> SPEC_MODE", x+8, y+13+b);
  ctx.fillText("RUNNING..._",  x+8, y+22+b);
  ctx.fillStyle = "#5566cc"; ctx.fillRect(x+36,y-16+b,4,16);
  ctx.fillStyle = "#ff4444"; ctx.fillRect(x+32,y-22+b,12,8);
}

function drawBossUsers(x,y,t) {
  const crowd = [[0,0,"#e07040"],[26,-8,"#d06030"],[52,2,"#c85028"],[-6,16,"#e08050"],[44,20,"#d07038"]];
  crowd.forEach(([ox,oy,col],i) => {
    const b = Math.round(Math.sin(t+i*1.1)*2);
    ctx.fillStyle = col; ctx.fillRect(x+ox+3, y+oy+b, 24,22);
    ctx.fillStyle = "#440000"; ctx.fillRect(x+ox+5,y+oy+3+b,7,3); ctx.fillRect(x+ox+14,y+oy+3+b,7,3);
    ctx.fillStyle = "#ff2200"; ctx.fillRect(x+ox+5,y+oy+6+b,6,5); ctx.fillRect(x+ox+14,y+oy+6+b,6,5);
    ctx.fillStyle = "#000";    ctx.fillRect(x+ox+7,y+oy+7+b,2,3); ctx.fillRect(x+ox+16,y+oy+7+b,2,3);
    ctx.fillStyle = "#440000"; ctx.fillRect(x+ox+7,y+oy+15+b,10,5);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(x+ox+8,y+oy+16+b,8,2); ctx.fillRect(x+ox+8,y+oy+19+b,8,1);
    if (i===0||i===2) {
      ctx.fillStyle = "#f0f0f0"; ctx.fillRect(x+ox+(i===0?-14:26), y+oy+5+b, 14,10);
      ctx.fillStyle = "#ff0000"; ctx.font="6px monospace"; ctx.fillText("!!!", x+ox+(i===0?-13:27), y+oy+13+b);
    }
  });
  ctx.fillStyle = "#804028"; ctx.fillRect(x+5, y+50, 70,34);
  ctx.fillStyle = "#603018"; ctx.fillRect(x, y+52, 14,22); ctx.fillRect(x+68, y+52, 14,22);
}

function drawBossOrgCulture(x,y,t) {
  const b = Math.round(Math.sin(t)*2);
  const brickC = ["#8a4a18","#7a3a10","#9a5a22"];
  for (let row=0;row<5;row++) {
    for (let col=0;col<4;col++) {
      const off = row%2===0?0:10;
      ctx.fillStyle = brickC[(row+col)%3];
      ctx.fillRect(x+off+col*20, y+20+row*14, 18,12);
      ctx.fillStyle = "rgba(0,0,0,.3)";
      ctx.fillRect(x+off+col*20, y+20+row*14, 18,2);
    }
  }
  ctx.fillStyle = "#ff2200"; ctx.fillRect(x+12,y+30+b,16,12); ctx.fillRect(x+48,y+30+b,16,12);
  ctx.fillStyle = "#ff8800"; ctx.fillRect(x+14,y+32+b,12,8);  ctx.fillRect(x+50,y+32+b,12,8);
  ctx.fillStyle = "#1a0000"; ctx.fillRect(x+18,y+34+b,4,4);   ctx.fillRect(x+54,y+34+b,4,4);
  ctx.fillStyle = "#601000"; ctx.fillRect(x+22,y+54+b,36,6);
  ctx.fillStyle = "#601000"; ctx.fillRect(x+22,y+60+b,4,4); ctx.fillRect(x+50,y+60+b,4,4);
  ctx.fillStyle = "#e0e8ff";
  for (let i=0;i<5;i++) {
    ctx.fillRect(x+4+i*16, y+2+b, 12,18);
    ctx.fillStyle="#8888cc"; ctx.fillRect(x+4+i*16, y+2+b, 12,3);
    ctx.fillStyle="#e0e8ff";
  }
  ctx.fillStyle = "#4444aa"; ctx.font="7px monospace";
  ctx.fillText("RULE",x+6, y+14+b);
  ctx.fillText("PROC",x+22,y+14+b);
  ctx.fillText("RULE",x+38,y+14+b);
}

function drawBossMiddleManagement(x,y,t) {
  const b = Math.round(Math.sin(t)*2);
  ctx.fillStyle = "#333355"; ctx.fillRect(x+16,y+78+b,18,16); ctx.fillRect(x+48,y+78+b,18,16);
  ctx.fillStyle = "#111827"; ctx.fillRect(x+14,y+92+b,22,6);  ctx.fillRect(x+46,y+92+b,22,6);
  ctx.fillStyle = "#444466"; ctx.fillRect(x+6, y+34+b,68,46);
  ctx.fillStyle = "#334455"; ctx.fillRect(x+6, y+34+b,22,46);
  ctx.fillStyle = "#3d3d5e"; ctx.fillRect(x-8, y+32+b,20,8); ctx.fillRect(x+68,y+32+b,20,8);
  ctx.fillRect(x-12,y+18+b,8,18); ctx.fillRect(x+84,y+18+b,8,18);
  ctx.fillStyle = "#ffa06a"; ctx.fillRect(x+16,y+4+b,48,34);
  // Spiral eyes (concentric squares)
  [[x+22,y+13],[x+48,y+13]].forEach(([ex,ey]) => {
    const s = Math.floor(t*2)%2;
    ["#333","#666","#999","#ccc","#fff"].forEach((c,ci) => {
      const sz = (4-ci)*3+s;
      if (sz>0) { ctx.fillStyle=c; ctx.fillRect(ex+b-sz/2, ey+b-sz/2, sz, sz); }
    });
  });
  ctx.fillStyle = "#884400"; ctx.fillRect(x+33,y+36+b,10,18); ctx.fillRect(x+30,y+50+b,16,6);
  [[20,-20],[-10,-15],[70,-25],[80,5]].forEach(([px,py],i) => {
    const angle = Math.sin(t*1.5+i)*10 * Math.PI/180;
    ctx.save();
    ctx.translate(x+px+7, y+py+9+b);
    ctx.rotate(angle);
    ctx.fillStyle="#f0f0e8"; ctx.fillRect(-7,-9,14,18);
    ctx.fillStyle="#aaa";    ctx.fillRect(-5,-6,10,1); ctx.fillRect(-5,-3,10,1); ctx.fillRect(-5,0,10,1);
    ctx.restore();
  });
}

function drawBossHydra(x,y,t) {
  ctx.fillStyle = "#3a1a3a"; ctx.fillRect(x+10,y+46,60,44);
  ctx.fillStyle = "#5a2a5a"; ctx.fillRect(x+12,y+48,56,8);
  ctx.fillStyle = "#4a1a4a";
  for (let i=0;i<3;i++) {
    ctx.fillRect(x+2+i*22, y+72, 6,12); ctx.fillRect(x+2+i*22, y+82,14,3);
    ctx.fillRect(x+52+i*12,y+72, 6,12); ctx.fillRect(x+52+i*12,y+82,14,3);
  }
  [[  -10,0,"#8a2a8a"],[22,-12,"#7a1a7a"],[54,4,"#9a3a9a"]].forEach(([hx,hy,col],i) => {
    const b = Math.round(Math.sin(t+i*1.2)*5);
    ctx.fillStyle = "#6a1a6a";
    for (let ni=0;ni<4;ni++) ctx.fillRect(x+hx+8+ni, y+28+ni*5+b, 12-ni*2,6);
    ctx.fillStyle = col;        ctx.fillRect(x+hx,    y+hy+b,     28,20);
    ctx.fillStyle = "#ff4444";  ctx.fillRect(x+hx+4,  y+hy+3+b,   6,6); ctx.fillRect(x+hx+16,y+hy+3+b,6,6);
    ctx.fillStyle = "#ffaa00";  ctx.fillRect(x+hx+6,  y+hy+5+b,   2,2); ctx.fillRect(x+hx+18,y+hy+5+b,2,2);
    ctx.fillStyle = "#ffffff";  ctx.fillRect(x+hx+6,  y+hy+15+b,  4,6); ctx.fillRect(x+hx+16,y+hy+15+b,4,6);
  });
}

function drawBossKraken(x,y,t) {
  const tentAngles = [0.1,0.4,0.7,2.4,2.8,3.1];
  tentAngles.forEach((angle,i) => {
    const wave = Math.sin(t+i*0.8)*22;
    const ox = x+40, oy = y+70;
    const ex = ox + Math.cos(angle)*100 + wave*1.3;
    const ey = y+110;
    ctx.fillStyle = "#1a6090";
    for (let s=0; s<=1; s+=0.12) {
      const bx2 = ox + (ex-ox)*s + (ex-ox)*s*(1-s)*0.4;
      const by2 = oy + (ey-oy)*s;
      const w   = Math.round(10*(1-s*0.6));
      ctx.fillRect(bx2-w/2, by2-4, w, 8);
    }
    ctx.fillStyle = "#40a0d0";
    ctx.beginPath(); ctx.arc(ex, ey, 4, 0, Math.PI*2); ctx.fill();
  });
  ctx.fillStyle = "#104060";
  ctx.beginPath(); ctx.ellipse(x+40,y+40,42,36,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = "#1a5080";
  ctx.beginPath(); ctx.ellipse(x+32,y+28,18,12,-0.3,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = "#ffff00";
  ctx.beginPath(); ctx.ellipse(x+22,y+32,14,16,0,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x+58,y+32,14,16,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = "#000";
  const ps = Math.round(Math.sin(t*0.7)*3);
  ctx.beginPath(); ctx.ellipse(x+22+ps,y+34,8,10,0,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x+58+ps,y+34,8,10,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = "#ffffff"; ctx.fillRect(x+18,y+26,4,4); ctx.fillRect(x+54,y+26,4,4);
  ctx.fillStyle = "#082030"; ctx.fillRect(x+20,y+54,40,14);
  ctx.fillStyle = "#ffffff";
  for (let ti=0;ti<5;ti++) { ctx.fillRect(x+22+ti*7,y+54,4,8); ctx.fillRect(x+24+ti*7,y+60,4,8); }
}

// ── OVERLAY ──────────────────────────────────────────────────────
function drawOverlay() {
  if (gameState.message) {
    ctx.fillStyle = "rgba(0,0,0,.78)"; ctx.fillRect(120,10,720,44);
    ctx.strokeStyle = "rgba(0,0,0,.9)"; ctx.lineWidth = 3;
    ctx.font = "bold 17px monospace";
    ctx.strokeText(gameState.message, 140, 37);
    ctx.fillStyle = "#9fffd8";
    ctx.fillText(gameState.message, 140, 37);
  }
  if (gameState.gameWon) {
    ctx.fillStyle = "rgba(0,0,0,.86)"; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.textAlign = "center";
    ctx.fillStyle = "#f7d74a"; ctx.font="bold 36px monospace";
    ctx.fillText("\u2713 GO LIVE ACHIEVED!", canvas.width/2, 200);
    ctx.fillStyle = "#9fffd8"; ctx.font="20px monospace";
    ctx.fillText("Integration shipped. SpecMan wins!", canvas.width/2, 250);
    ctx.fillStyle = "rgba(255,255,255,.4)"; ctx.font="12px monospace";
    ctx.fillText("powered by Sonny as a Service  \u00b7  sonnyasaservice.nl", canvas.width/2, 295);
    ctx.fillText("Refresh to replay from saved progress.", canvas.width/2, 320);
    ctx.textAlign = "left";
  }
}

// ── HUD ──────────────────────────────────────────────────────────
function updateHud() {
  const stage = STAGES[gameState.stageIndex];
  stageNameEl.textContent = stage.name;
  bossNameEl.textContent  = stage.boss;
  healthEl.textContent    = "\u2588".repeat(player.hp) + " (" + player.hp + ")";
  healthEl.setAttribute("aria-label", "Health " + player.hp + " out of 7");
  const active = Object.entries(gameState.effects)
    .filter(([,v]) => v>0).map(([k]) => k).join(", ");
  powerupsEl.textContent  = active || "none";
  progressEl.textContent  = (gameState.stageIndex+1) + " / " + STAGES.length;
}

// ── MAIN LOOP ─────────────────────────────────────────────────────
function loop() {
  const camX = getCamX();
  if (!gameState.gameWon) {
    handleInput();
    physics();
    updatePickups();
    updateMinions();
    updateBoss();
    tickEffects();
  }
  drawBackground(camX);
  drawDecorations(camX);
  drawPlatforms(camX);
  drawPickups(camX);
  drawMinions(camX);
  drawBoss(camX);
  drawPlayer(camX);
  drawOverlay();
  updateHud();
  requestAnimationFrame(loop);
}

// ── EVENT HANDLERS ───────────────────────────────────────────────
document.addEventListener("keydown", e => {
  if (GAME_CONTROL_KEYS.includes(e.code)) e.preventDefault();
  if (e.code==="Space" && player.onGround && !gameState.gameWon) {
    const boost = gameState.effects.jump > 0 ? 2.4 : 0;
    player.vy = -(JUMP_STR + boost);
    beep(520,0.08,"square",0.03);
  }
  if (e.code==="KeyY" && player.dashCooldown === 0 && !gameState.gameWon) {
    player.dashFrames = 12;
    player.dashCooldown = 50;
    beep(440, 0.05, "square", 0.028);
    beep(880, 0.09, "square", 0.018);
  }
  if (e.code==="KeyM") {
    soundOn = !soundOn;
    toggleSoundBtn.textContent = "\u266a SND " + (soundOn?"ON":"OFF");
  }
  if (e.code==="KeyP") saveProgress();
  keys.add(e.code);
});

document.addEventListener("keyup", e => keys.delete(e.code));

toggleSoundBtn.addEventListener("click", () => {
  soundOn = !soundOn;
  toggleSoundBtn.textContent = "\u266a SND " + (soundOn?"ON":"OFF");
});
saveProgressBtn.addEventListener("click",  saveProgress);
resetProgressBtn.addEventListener("click", resetProgress);

// ── BOOT ─────────────────────────────────────────────────────────
tryLoad();
initStage();
startBgm();
showMessage("Welcome, Integration Consultant! Stage 1: Discovery");
loop();
