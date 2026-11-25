// ============================================================
//   ALDEA BELLA BINGO — Servidor (local HTTPS + nube HTTP)
// ============================================================

require("dotenv").config();
const express = require("express");
const https = require("https");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const fs = require("fs");
const QRCode = require("qrcode");

const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  throw new Error("Faltan SUPABASE_URL o SUPABASE_ANON_KEY en .env");
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const cards = require("./lib/cards");
const economy = require("./lib/economy");
const bots = require("./lib/bots");
const moderation = require("./lib/moderation");
const lock = require("./lib/lock");

lock.setSupabaseClient(supabase);

const PORT = Number(process.env.PORT) || 3000;
const MASTER_PASSWORD = process.env.MASTER_PASSWORD || "aldeabella2026!";
const IS_PROD = process.env.NODE_ENV === "production";
let BAR_NAME = process.env.BAR_NAME || "Bar Aldea Bella";

// Variables globales (se llenarán en init)
let SAVED_SESSION_CODE = null;
let BASE_CONFIG = null;
let ALL_CONFIG = null;
const MAX_PRESETS = 6;

async function initConfig() {
  console.log("⏳ Conectando con Supabase para cargar configuración...");
  let persistedConfig = await lock.loadConfig();

  if (!persistedConfig) {
    console.log("🌱 Supabase vacío. Creando configuración por defecto...");
    persistedConfig = {
      baseConfig: {
        barName: "ALDEA BELLA",
        entryFee: 1.5,
        split: { line: 35, bingo: 55, house: 10 },
        options: {
          roundToHalf: true, carryOverBingo: true, lockOnStart: true, prizeMode: "first",
          claimWindow: 15, splitRoundStep: 0.5, autoDrawDelay: 3, ballHistorySize: 3,
          freeCells: 8, freeCellsPerRow: 2, ballsPerColumn: 15, maxPlayers: 15,
          unattendedMode: "off", unattendedCountdown: 30, unattendedResumeCountdown: 10,
          sounds: {
            enabled: true, voiceBalls: true, applauseOnLine: false, applauseOnBingo: true,
            applauseOnRoundStart: false, playOnMaster: true, playOnPlayers: true, playOnDisplay: true, volume: 0.7
          }
        }
      },
      presets: [null, null, null, null, null, null],
      publicUrl: process.env.PUBLIC_URL || ""
    };
    await lock.saveConfig(persistedConfig);
  }

  if (persistedConfig?.baseConfig?.barName) {
    BAR_NAME = persistedConfig.baseConfig.barName;
  }
  SAVED_SESSION_CODE = persistedConfig?.sessionCode || null;
  BASE_CONFIG = persistedConfig?.baseConfig || {};
  
  if (BASE_CONFIG.options && BASE_CONFIG.options.maxPlayers === undefined) {
    BASE_CONFIG.options.maxPlayers = 15;
  }

  ALL_CONFIG = persistedConfig;

  if (!ALL_CONFIG.presets) ALL_CONFIG.presets = [];
  while (ALL_CONFIG.presets.length < MAX_PRESETS) ALL_CONFIG.presets.push(null);
  if (ALL_CONFIG.presets.length > MAX_PRESETS) {
    ALL_CONFIG.presets = ALL_CONFIG.presets.slice(0, MAX_PRESETS);
  }

  if (!ALL_CONFIG.publicUrl) {
    ALL_CONFIG.publicUrl = process.env.PUBLIC_URL || "";
  }
  
  console.log("✅ Configuración cargada.");
}

// ============================================================
//   SSL / HTTP según entorno
// ============================================================
const certsDir = path.join(__dirname, "certs");
const certPath = path.join(certsDir, "cert.pem");
const keyPath = path.join(certsDir, "key.pem");

const app = express();

// AÑADIR ESTAS 4 LÍNEAS AQUÍ:
app.use(express.static(path.join(__dirname, "public")));
app.get("/master", (req, res) => res.sendFile(path.join(__dirname, "public", "master.html")));
app.get("/display", (req, res) => res.sendFile(path.join(__dirname, "public", "display.html")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "player.html")));

let server;
if (IS_PROD) {

  server = http.createServer(app);
} else {
  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    console.error("❌ Faltan certificados SSL. Ejecuta: node generate-cert.js");
    process.exit(1);
  }
  const sslOptions = { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
  server = https.createServer(sslOptions, app);
}


// ============================================================
//   ESTADO GLOBAL
// ============================================================
let game = null;

function generateSessionCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function logEvent(type, data) {
  const entry = { time: Date.now(), type, ...data };
  game.log.push(entry);
  if (game.log.length > 1000) game.log.shift();
  console.log(`[${new Date(entry.time).toLocaleTimeString()}]`, type, data);
}

function send(ws, msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcastToPlayers(msg, filterFn = null) {
  game.players.forEach(p => {
    if (p.role === "master" || p.role === "display") return;
    if (filterFn && !filterFn(p)) return;
    send(p.ws, msg);
  });
}

function broadcastToMasters(msg) {
  game.players.forEach(p => {
    if (p.role === "master" || p.role === "display") send(p.ws, msg);
  });
}

function saveLastConfig() {
  if (!ALL_CONFIG) return;
  ALL_CONFIG.lastConfig = JSON.parse(JSON.stringify(game.config.config));
  lock.saveConfig(ALL_CONFIG).catch(err =>
    console.error("⚠️ Error guardando config:", err.message)
  );
}

function pushMasterState() {
  broadcastToMasters({ type: "master_state", state: getMasterState() });
}

function pushPublicState() {
  broadcastToMasters({ type: "public_state", state: getPublicState() });
}

function getPublicState() {
  const realPlayers = game.players.filter(p => p.role !== "master" && p.role !== "display");
  const approvedCount = realPlayers.filter(p => p.status === "approved").length;
  const maxPlayers = game.config.config.options.maxPlayers || 15;
  const { ready: wrReady, total: wrTotal } = getReadyCount();
  const countdownActive = !!game.waitingRoom.countdownEndsAt;
  const secondsLeft = countdownActive
    ? Math.max(0, Math.ceil((game.waitingRoom.countdownEndsAt - Date.now()) / 1000))
    : 0;

  return {
    barName: BAR_NAME,
    sessionCode: game.sessionCode,
    round: game.round ? {
      number: game.round.number, type: game.round.type, status: game.round.status,
      lastBall: game.round.calledBalls[game.round.calledBalls.length - 1] || null,
      calledBalls: game.round.calledBalls, remainingBalls: game.round.balls,
      config: game.round.config, pool: game.round.pool, winners: game.round.winners,
      pausedFor: game.round.pausedFor || null, claimWindow: game.round.claimWindow || null,
      freeCells: game.round.config?.options?.freeCells || 1,
      startedAt: game.round.startedAt || null, endedAt: game.round.endedAt || null
    } : null,
    config: game.config.config,
    locked: game.config.locked,
    carryOver: game.carryOver,
    playerCount: approvedCount,
    maxPlayers: maxPlayers,
    slotsLeft: Math.max(0, maxPlayers - approvedCount),
    pendingCount: realPlayers.filter(p => p.status === "pending" || p.status === "paid").length,
    autoDraw: { enabled: game.autoDraw.enabled, delay: game.autoDraw.delay },
    modalOpen: { count: game.modalOpen.count, lastPlayerName: game.modalOpen.lastPlayerName },
    ballHistorySize: game.config.config.options.ballHistorySize || 3,
    freeCellsPerRow: game.config.config.options.freeCellsPerRow || 2,
    sounds: game.config.config.options.sounds || null,
    publicUrl: ALL_CONFIG.publicUrl || null,
    unattendedMode: game.config.config.options.unattendedMode || "off",
    unattendedCountdown: game.config.config.options.unattendedCountdown || 30,
    waitingRoom: { ready: wrReady, total: wrTotal, countdownActive, secondsLeft },
    awaitingPayout: {
      active: game.awaitingPayout.active, claimType: game.awaitingPayout.claimType,
      winners: game.awaitingPayout.winners.map(w => ({ ...w, paid: game.awaitingPayout.paidIds.has(w.playerId) })),
      countdownActive: !!game.awaitingPayout.countdownEndsAt,
      secondsLeft: game.awaitingPayout.countdownEndsAt
        ? Math.max(0, Math.ceil((game.awaitingPayout.countdownEndsAt - Date.now()) / 1000)) : 0
    }
  };
}

function getMasterState() {
  return {
    ...getPublicState(),
    players: game.players
      .filter(p => p.role !== "master" && p.role !== "display")
      .map(p => ({
        id: p.id, name: p.name, ip: p.ip, status: p.status, paid: p.paid,
        isBot: !!p.isBot, cards: p.cards.length, cardsData: p.cards,
        notes: p.notes, stats: p.stats, lineClaim: p.lineClaim, bingoClaim: p.bingoClaim,
        ready: !!p.readyForNextRound,
        connected: p.ws && p.ws.readyState === WebSocket.OPEN
      })),
    presets: ALL_CONFIG.presets || [],
    log: game.log.slice(-50),
    currentConfig: game.config.config,
    configHistory: game.config.history.slice(-20),
    demoMode: game.demoMode,
    claimWindow: game.round?.claimWindow || null
  };
}

// ============================================================
//   MODO DESATENDIDO / CUPO
// ============================================================
function isUnattendedMode() {
  return game.config.config.options.unattendedMode === "free";
}

function getMaxPlayers() {
  return Math.max(2, Math.min(50, Number(game.config.config.options.maxPlayers) || 15));
}

function getApprovedPlayers() {
  return game.players.filter(p =>
    p.role !== "master" && p.role !== "display" &&
    p.status === "approved" && p.paid === true
  );
}

function getReadyCount() {
  const approved = getApprovedPlayers();
  const ready = approved.filter(p => p.readyForNextRound === true).length;
  return { ready, total: approved.length };
}

function isAllReady() {
  const { ready, total } = getReadyCount();
  return total > 0 && ready === total;
}

function isCupoFull() {
  return getApprovedPlayers().length >= getMaxPlayers();
}

function startWaitingRoomCountdown() {
  if (!isUnattendedMode()) return;
  if (game.round && game.round.status !== "ended") return;
  if (game.waitingRoom.countdownTimer) return;
  if (!isAllReady() && !isCupoFull()) return;

  const seconds = Math.max(5, Math.min(120, game.config.config.options.unattendedCountdown || 30));
  const endsAt = Date.now() + seconds * 1000;

  game.waitingRoom.countdownEndsAt = endsAt;
  logEvent("waiting_room_countdown_started", { seconds });

  broadcastToPlayers({ type: "waiting_room_countdown", seconds, endsAt });
  broadcastToMasters({ type: "waiting_room_countdown", seconds, endsAt, state: getMasterState() });

  game.waitingRoom.countdownTimer = setTimeout(() => {
    game.waitingRoom.countdownTimer = null;
    game.waitingRoom.countdownEndsAt = null;
    if (game.waitingRoom.countdownTick) {
      clearInterval(game.waitingRoom.countdownTick);
      game.waitingRoom.countdownTick = null;
    }
    if (!isAllReady() && !isCupoFull()) {
      broadcastToPlayers({ type: "waiting_room_countdown_cancelled", reason: "not_all_ready" });
      broadcastToMasters({ type: "waiting_room_countdown_cancelled", reason: "not_all_ready" });
      pushWaitingRoomState();
      return;
    }
    autoStartRoundFromWaitingRoom();
  }, seconds * 1000);
}

function cancelWaitingRoomCountdown(reason) {
  if (game.waitingRoom.countdownTimer) {
    clearTimeout(game.waitingRoom.countdownTimer);
    game.waitingRoom.countdownTimer = null;
  }
  if (game.waitingRoom.countdownTick) {
    clearInterval(game.waitingRoom.countdownTick);
    game.waitingRoom.countdownTick = null;
  }
  game.waitingRoom.countdownEndsAt = null;
  if (reason) {
    broadcastToPlayers({ type: "waiting_room_countdown_cancelled", reason });
    broadcastToMasters({ type: "waiting_room_countdown_cancelled", reason });
  }
}

function autoStartRoundFromWaitingRoom(force = false) {
  if (!force && !isAllReady() && !isCupoFull()) return;
  if (getApprovedPlayers().length < 1) return;

  const delay = Math.max(1, Math.min(60, Number(game.config.config.options.autoDrawDelay) || 3));
  game.autoDraw.delay = delay;

  getApprovedPlayers().forEach(p => { p.readyForNextRound = false; });

  logEvent("waiting_room_auto_starting_round", { delay, force });
  startNewRound("real", null);

  if (!game.autoDraw.enabled) startAutoDraw();
}

function pushWaitingRoomState() {
  const { ready, total } = getReadyCount();
  const approved = getApprovedPlayers();
  const maxPlayers = getMaxPlayers();
  const countdownActive = !!game.waitingRoom.countdownEndsAt;
  const secondsLeft = countdownActive
    ? Math.max(0, Math.ceil((game.waitingRoom.countdownEndsAt - Date.now()) / 1000)) : 0;

  const payload = {
    type: "waiting_room_state",
    unattendedMode: game.config.config.options.unattendedMode,
    ready, total, maxPlayers,
    slotsLeft: Math.max(0, maxPlayers - total),
    cupoFull: total >= maxPlayers,
    countdownActive, secondsLeft,
    players: approved.map(p => ({ id: p.id, name: p.name, ready: !!p.readyForNextRound }))
  };
  broadcastToPlayers(payload);
  broadcastToMasters({ ...payload, state: getMasterState() });
}

// ============================================================
//   ESPERANDO COBRO
// ============================================================
function startAwaitingPayout(claimType, winnersList) {
  if (!isUnattendedMode()) return;
  game.awaitingPayout.active = true;
  game.awaitingPayout.claimType = claimType;
  game.awaitingPayout.winners = winnersList.map(w => ({
    playerId: w.playerId, playerName: w.playerName, code: w.code, amount: w.amount
  }));
  game.awaitingPayout.paidIds = new Set();
  broadcastToPlayers({ type: "awaiting_payout", claim: claimType, winners: game.awaitingPayout.winners });
  broadcastToMasters({ type: "awaiting_payout", claim: claimType, winners: game.awaitingPayout.winners, state: getMasterState() });
  pushMasterState();

  const botWinners = game.awaitingPayout.winners.filter(w => {
    const p = game.players.find(pl => pl.id === w.playerId);
    return p && p.isBot;
  });
  if (botWinners.length > 0) {
    setTimeout(() => {
      botWinners.forEach(w => {
        if (game.awaitingPayout.active && !game.awaitingPayout.paidIds.has(w.playerId)) {
          game.awaitingPayout.paidIds.add(w.playerId);
          checkAllPayoutsDone();
        }
      });
    }, 2000);
  }
}

function removeWinnerFromAwaitingPayout(playerId) {
  if (!game.awaitingPayout.active) return;
  const wasIn = game.awaitingPayout.winners.some(w => w.playerId === playerId);
  if (!wasIn) return;
  game.awaitingPayout.winners = game.awaitingPayout.winners.filter(w => w.playerId !== playerId);
  game.awaitingPayout.paidIds.delete(playerId);
  if (game.awaitingPayout.winners.length === 0) {
    if (game.awaitingPayout.countdownTimer) { clearTimeout(game.awaitingPayout.countdownTimer); game.awaitingPayout.countdownTimer = null; }
    game.awaitingPayout.active = false;
    game.awaitingPayout.claimType = null;
    game.awaitingPayout.winners = [];
    game.awaitingPayout.paidIds = new Set();
    game.awaitingPayout.countdownEndsAt = null;
    if (game.round && game.round.status === "paused_manual") {
      game.round.status = "playing";
      game.round.pausedFor = null;
      broadcastToPlayers({ type: "round_status", status: "playing", reason: "payout_resolved" });
      broadcastToMasters({ type: "round_status", status: "playing", reason: "payout_resolved" });
      if (!game.autoDraw.enabled) { game.autoDraw.enabled = true; scheduleNextAutoBall(); }
    }
    pushMasterState(); pushPublicState();
    return;
  }
  checkAllPayoutsDone();
}

function checkAllPayoutsDone() {
  if (!game.awaitingPayout.active) return;
  const allPaid = game.awaitingPayout.winners.every(w => game.awaitingPayout.paidIds.has(w.playerId));
  if (!allPaid) return;
  startResumeCountdownAfterPayout();
}

function startResumeCountdownAfterPayout() {
  const seconds = Math.max(5, Math.min(120, game.config.config.options.unattendedResumeCountdown || 10));
  const endsAt = Date.now() + seconds * 1000;
  game.awaitingPayout.countdownEndsAt = endsAt;
  broadcastToPlayers({ type: "resume_countdown", seconds, endsAt });
  broadcastToMasters({ type: "resume_countdown", seconds, endsAt, state: getMasterState() });
  if (game.awaitingPayout.countdownTimer) clearTimeout(game.awaitingPayout.countdownTimer);
  game.awaitingPayout.countdownTimer = setTimeout(() => {
    game.awaitingPayout.countdownTimer = null;
    game.awaitingPayout.countdownEndsAt = null;
    game.awaitingPayout.active = false;
    game.awaitingPayout.claimType = null;
    game.awaitingPayout.winners = [];
    game.awaitingPayout.paidIds = new Set();
    if (game.round && game.round.status === "paused_manual") {
      game.round.status = "playing";
      game.round.pausedFor = null;
      broadcastToPlayers({ type: "round_status", status: "playing", reason: "payout_resolved" });
      broadcastToMasters({ type: "round_status", status: "playing", reason: "payout_resolved" });
      if (!game.autoDraw.enabled) { game.autoDraw.enabled = true; scheduleNextAutoBall(); }
    }
    pushMasterState(); pushPublicState(); pushWaitingRoomState();
  }, seconds * 1000);
}

// ============================================================
//   AUTO-DRAW
// ============================================================
function startAutoDraw() {
  stopAutoDraw();
  if (!game.round || game.round.status === "ended") return;
  if (game.autoDraw.delay < 1) game.autoDraw.delay = 1;
  game.autoDraw.enabled = true;
  scheduleNextAutoBall();
  pushMasterState();
}

function pauseAutoForModal() {
  game.autoDraw.pausedForModal = true;
  if (game.autoDraw.timer) { clearTimeout(game.autoDraw.timer); game.autoDraw.timer = null; }
}

function resumeAutoFromModal() {
  game.autoDraw.pausedForModal = false;
  if (game.autoDraw.enabled) scheduleNextAutoBall();
}

function resumeAutoAfterClaim() {
  if (game.autoDraw.wasActiveBeforeClaim) {
    game.autoDraw.wasActiveBeforeClaim = false;
    if (!game.autoDraw.enabled) { game.autoDraw.enabled = true; scheduleNextAutoBall(); }
  } else {
    game.autoDraw.wasActiveBeforeClaim = false;
  }
  pushMasterState();
}

function stopAutoDraw() {
  if (game.autoDraw.timer) { clearTimeout(game.autoDraw.timer); game.autoDraw.timer = null; }
  if (game.autoDraw.enabled) game.autoDraw.enabled = false;
  pushMasterState();
}

function scheduleNextAutoBall() {
  if (!game.autoDraw.enabled) return;
  if (game.autoDraw.pausedForModal) return;
  if (!game.round || game.round.status === "ended") { stopAutoDraw(); return; }
  if (game.autoDraw.timer) clearTimeout(game.autoDraw.timer);
  game.autoDraw.timer = setTimeout(() => {
    game.autoDraw.timer = null;
    if (!game.autoDraw.enabled) return;
    if (game.autoDraw.pausedForModal) return;
    if (!game.round || game.round.status !== "playing" || game.round.pausedFor) {
      if (!game.round || game.round.status === "ended") stopAutoDraw();
      else scheduleNextAutoBall();
      return;
    }
    drawBall();
    if (game.autoDraw.enabled && game.round && game.round.status === "playing") scheduleNextAutoBall();
    else if (game.autoDraw.enabled) stopAutoDraw();
  }, game.autoDraw.delay * 1000);
}

function setAutoDrawDelay(seconds) {
  const s = Math.max(1, Math.min(60, Number(seconds) || 3));
  game.autoDraw.delay = s;
  if (game.autoDraw.enabled) scheduleNextAutoBall();
  pushMasterState();
}


// ============================================================
//   WEBSOCKET
// ============================================================


// ============================================================
//   MENSAJES
// ============================================================
function handleMessage(ws, msg, ip) {
  switch (msg.type) {
    case "master_set_bar_name": {
      if (ws.role !== "master") return;
      const newName = String(msg.name || "").trim().slice(0, 40);
      if (!newName) { send(ws, { type: "master_error", message: "Nombre vacío" }); return; }
      BAR_NAME = newName;
      game.config.config.barName = newName;
      if (!ALL_CONFIG.baseConfig) ALL_CONFIG.baseConfig = {};
      ALL_CONFIG.baseConfig.barName = newName;
      saveLastConfig(); lock.saveConfig(ALL_CONFIG);
      broadcastToMasters({ type: "bar_name_changed", name: BAR_NAME });
      broadcastToPlayers({ type: "bar_name_changed", name: BAR_NAME });
      pushMasterState(); pushPublicState();
      break;
    }

    case "master_login": {
      if (msg.password !== MASTER_PASSWORD) { send(ws, { type: "master_login_failed" }); return; }
      ws.role = "master";
      const masterId = "m_" + Math.random().toString(36).slice(2, 10);
      game.players.push({
        id: masterId, name: "MASTER", ip, ws, role: "master",
        status: "master", paid: true, isBot: false, cards: [],
        notes: "", stats: {}, lineClaim: null, bingoClaim: null
      });
      ws.playerId = masterId;
      send(ws, { type: "master_login_ok", state: getMasterState(), qr: null });
      break;
    }

    case "generate_new_session": {
      if (ws.role !== "master") return;
      game.sessionCode = generateSessionCode();
      ALL_CONFIG.sessionCode = game.sessionCode;
      saveLastConfig();
      broadcastToMasters({ type: "session_code", code: game.sessionCode });
      pushMasterState();
      break;
    }

    case "master_set_session_code": {
      if (ws.role !== "master") return;
      const newCode = String(msg.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!newCode) { send(ws, { type: "master_error", message: "Código vacío" }); return; }
      game.sessionCode = newCode;
      ALL_CONFIG.sessionCode = newCode;
      saveLastConfig();
      broadcastToMasters({ type: "session_code", code: newCode });
      pushMasterState();
      break;
    }

    case "master_set_max_players": {
      if (ws.role !== "master") return;
      const n = Math.max(2, Math.min(50, Number(msg.maxPlayers) || 15));
      game.config.config.options.maxPlayers = n;
      if (game.round && game.round.config && game.round.config.options) {
        game.round.config.options.maxPlayers = n;
      }
      if (!ALL_CONFIG.baseConfig) ALL_CONFIG.baseConfig = {};
      if (!ALL_CONFIG.baseConfig.options) ALL_CONFIG.baseConfig.options = {};
      ALL_CONFIG.baseConfig.options.maxPlayers = n;
      saveLastConfig();
      broadcastToMasters({ type: "max_players_changed", maxPlayers: n });
      broadcastToPlayers({ type: "max_players_changed", maxPlayers: n });
      pushMasterState(); pushPublicState(); pushWaitingRoomState();
      break;
    }

    case "master_set_public_url": {
      if (ws.role !== "master") return;
      const newUrl = String(msg.url || "").trim();
      if (!newUrl || !/^https?:\/\//i.test(newUrl)) {
        send(ws, { type: "master_error", message: "URL inválida" }); return;
      }
      ALL_CONFIG.publicUrl = newUrl;
      saveLastConfig();
      broadcastToMasters({ type: "public_url_changed", url: newUrl });
      pushMasterState();
      break;
    }

    case "master_get_state": {
      if (ws.role !== "master") return;
      send(ws, { type: "master_state", state: getMasterState() });
      break;
    }

    case "display_connect": {
      ws.role = "display";
      const displayId = "d_" + Math.random().toString(36).slice(2, 10);
      game.players.push({
        id: displayId, name: "DISPLAY", ip, ws, role: "display",
        status: "display", paid: true, isBot: false, cards: [],
        notes: "", stats: {}, lineClaim: null, bingoClaim: null
      });
      ws.playerId = displayId;
      send(ws, { type: "public_state", state: getPublicState() });
      break;
    }

    case "player_join": {
      const { code, name } = msg;
      if (code !== game.sessionCode) {
        send(ws, { type: "join_error", message: "Código de sala inválido" });
        return;
      }
      if (moderation.isOffensive(name, ALL_CONFIG)) {
        send(ws, { type: "join_error", message: "Elige otro nombre" });
        return;
      }
      const upperName = String(name || "").toUpperCase();

      const nameTaken = game.players.find(p =>
        p.role !== "master" && p.role !== "display" &&
        p.name.toUpperCase() === upperName &&
        ["pending", "paid", "approved"].includes(p.status) && p.ip !== ip
      );
      if (nameTaken) { send(ws, { type: "join_error", message: "Nombre en uso" }); return; }

      const existingPlayer = game.players.find(p =>
        p.role !== "master" && p.role !== "display" &&
        p.ip === ip && p.name.toUpperCase() === upperName &&
        ["pending", "paid", "approved"].includes(p.status)
      );

      if (existingPlayer) {
        existingPlayer.ws = ws;
        ws.role = "player";
        ws.playerId = existingPlayer.id;
        if (game.round && game.round.status === "playing" && existingPlayer.cards.length > 0) {
          const calledNumbers = new Set(game.round.calledBalls.map(b => b.number));
          existingPlayer.cards.forEach(card => {
            for (let r = 0; r < card.numbers.length; r++) {
              for (let c = 0; c < card.numbers[r].length; c++) {
                const val = card.numbers[r][c];
                if (val !== "FREE" && calledNumbers.has(val)) card.marked[r][c] = true;
              }
            }
          });
        }
        send(ws, {
          type: "player_reconnected",
          barName: BAR_NAME, name: existingPlayer.name,
          status: existingPlayer.status, paid: existingPlayer.paid,
          cards: existingPlayer.cards,
          roundType: game.round?.type || null, pool: game.round?.pool || null,
          lineClaimPending: !!existingPlayer.lineClaim,
          bingoClaimPending: !!existingPlayer.bingoClaim,
          ballHistorySize: game.config.config.options.ballHistorySize || 3,
          ballsPerColumn: game.config.config.options.ballsPerColumn || 15,
          freeCellsPerRow: game.config.config.options.freeCellsPerRow || 2,
          freeCells: (game.config.config.options.freeCellsPerRow || 2) * 4,
          sounds: game.config.config.options.sounds || null,
          publicUrl: ALL_CONFIG.publicUrl || null,
          round: game.round ? {
            number: game.round.number, type: game.round.type, status: game.round.status,
            lastBall: game.round.calledBalls[game.round.calledBalls.length - 1] || null,
            calledBalls: game.round.calledBalls, remainingBalls: game.round.balls,
            config: game.round.config, pool: game.round.pool, winners: game.round.winners,
            pausedFor: game.round.pausedFor || null, claimWindow: game.round.claimWindow || null,
            freeCells: game.round.config?.options?.freeCells || 1
          } : null
        });
        pushMasterState();
        return;
      }

      const isRoundActive = game.round &&
        (game.round.status === "playing" || game.round.status === "paused" || game.round.status === "paused_manual");
      if (isRoundActive) {
        send(ws, { type: "join_error", message: "⏳ Hay una partida en curso. Espera." });
        return;
      }

      if (isCupoFull()) {
        send(ws, { type: "join_error", message: "🚫 Sala llena" });
        return;
      }

      const id = "p_" + Math.random().toString(36).slice(2, 10);
      const player = moderation.createPlayerRecord({ id, name: upperName, ip, ws });
      player.role = "player";
      game.players.push(player);
      ws.role = "player";
      ws.playerId = id;

      player.paid = true;
      player.status = "approved";
      player.readyForNextRound = false;

      send(ws, {
        type: "you_approved", barName: BAR_NAME,
        sounds: game.config.config.options.sounds || null,
        unattendedMode: game.config.config.options.unattendedMode || "free"
      });
      send(ws, { type: "sounds_config_changed", sounds: game.config.config.options.sounds || null });

      const { ready: readyNow, total: approvedNow } = getReadyCount();
      const max = getMaxPlayers();
      send(ws, {
        type: "waiting_room_state",
        unattendedMode: game.config.config.options.unattendedMode,
        ready: readyNow, total: approvedNow, maxPlayers: max,
        slotsLeft: Math.max(0, max - approvedNow),
        cupoFull: approvedNow >= max,
        countdownActive: !!game.waitingRoom.countdownEndsAt,
        secondsLeft: game.waitingRoom.countdownEndsAt
          ? Math.max(0, Math.ceil((game.waitingRoom.countdownEndsAt - Date.now()) / 1000)) : 0,
        players: getApprovedPlayers().map(p => ({ id: p.id, name: p.name, ready: !!p.readyForNextRound }))
      });

      broadcastToMasters({
        type: "new_approved_player",
        player: { id: player.id, name: player.name, ip: player.ip, isBot: false }
      });

      pushMasterState();
      pushWaitingRoomState();

      if (isAllReady() || isCupoFull()) {
        startWaitingRoomCountdown();
      }
      break;
    }

    case "master_mark_paid": {
      if (ws.role !== "master") return;
      const p = game.players.find(pl => pl.id === msg.playerId);
      if (p) { moderation.markPaid(p); send(p.ws, { type: "you_paid" }); pushMasterState(); }
      break;
    }

    case "master_approve": {
      if (ws.role !== "master") return;
      const p = game.players.find(pl => pl.id === msg.playerId);
      if (!p) return;
      if (!p.paid) { send(ws, { type: "master_error", message: "⚠️ No ha pagado" }); return; }
      if (isCupoFull()) { send(ws, { type: "master_error", message: "🚫 Sala llena" }); return; }
      if (moderation.approve(p)) {
        send(p.ws, {
          type: "you_approved", barName: BAR_NAME,
          sounds: game.config.config.options.sounds || null,
          unattendedMode: game.config.config.options.unattendedMode || "off"
        });
        send(p.ws, { type: "sounds_config_changed", sounds: game.config.config.options.sounds || null });
        pushMasterState();
        pushWaitingRoomState();
        if (isCupoFull()) startWaitingRoomCountdown();
      }
      break;
    }

    case "master_reject": {
      if (ws.role !== "master") return;
      const p = game.players.find(pl => pl.id === msg.playerId);
      if (p) {
        p.status = "rejected";
        send(p.ws, { type: "you_rejected" });
        pushMasterState();
        setTimeout(() => {
          if (p.ws) p.ws.close();
          game.players = game.players.filter(pl => pl.id !== p.id);
          pushMasterState(); pushWaitingRoomState();
        }, 2000);
      }
      break;
    }

    case "master_ban": {
      if (ws.role !== "master") return;
      const p = game.players.find(pl => pl.id === msg.playerId);
      if (p) {
        p.status = "banned";
        send(p.ws, { type: "you_banned" });
        removeWinnerFromAwaitingPayout(p.id);
        pushMasterState();
        setTimeout(() => {
          if (p.ws) p.ws.close();
          game.players = game.players.filter(pl => pl.id !== p.id);
          pushMasterState(); pushWaitingRoomState();
        }, 2000);
      }
      break;
    }

    case "master_note": {
      if (ws.role !== "master") return;
      const p = game.players.find(pl => pl.id === msg.playerId);
      if (p) { p.notes = String(msg.note || "").slice(0, 200); pushMasterState(); }
      break;
    }

    case "master_rename": {
      if (ws.role !== "master") return;
      const p = game.players.find(pl => pl.id === msg.playerId);
      if (p) {
        const nn = moderation.sanitizeName(msg.newName);
        const conflict = game.players.find(pl =>
          pl.id !== p.id && pl.role !== "master" && pl.role !== "display" &&
          pl.name.toUpperCase() === nn.toUpperCase() &&
          ["pending", "paid", "approved"].includes(pl.status)
        );
        if (conflict) { send(ws, { type: "master_error", message: "Nombre en uso" }); return; }
        p.name = nn;
        send(p.ws, { type: "your_name_changed", name: nn });
        pushMasterState(); pushWaitingRoomState();
      }
      break;
    }

    case "player_change_name": {
      if (ws.role !== "player") return;
      const p = game.players.find(pl => pl.ws === ws);
      if (!p) return;
      const nn = moderation.sanitizeName(msg.newName);
      if (!nn) { send(ws, { type: "master_error", message: "Nombre no válido" }); return; }
      const conflict = game.players.find(pl =>
        pl.id !== p.id && pl.role !== "master" && pl.role !== "display" &&
        pl.name.toUpperCase() === nn.toUpperCase() &&
        ["pending", "paid", "approved"].includes(pl.status)
      );
      if (conflict) { send(ws, { type: "master_error", message: "Nombre en uso" }); return; }
      p.name = nn;
      send(p.ws, { type: "your_name_changed", name: nn });
      pushMasterState(); pushWaitingRoomState();
      break;
    }

    case "master_kick": {
      if (ws.role !== "master") return;
      const p = game.players.find(pl => pl.id === msg.playerId);
      if (p) {
        p.status = "kicked";
        send(p.ws, { type: "you_kicked" });
        removeWinnerFromAwaitingPayout(p.id);
        setTimeout(() => { if (p.ws) p.ws.close(); }, 2000);
        pushMasterState(); pushWaitingRoomState();
      }
      break;
    }

    case "master_update_config": {
      if (ws.role !== "master") return;
      const { entryFee, split, options } = msg.config || {};
      if (entryFee !== undefined && entryFee !== null) {
        game.config.config.entryFee = Math.max(0, Math.min(20, +entryFee));
      }
      if (split) {
        let { line, bingo, house } = split;
        line = Math.max(0, Math.min(100, +line));
        bingo = Math.max(0, Math.min(100, +bingo));
        house = Math.max(0, Math.min(100, +house));
        const sum = line + bingo + house;
        if (sum !== 100 && sum > 0) {
          const factor = 100 / sum;
          line = Math.round(line * factor);
          bingo = Math.round(bingo * factor);
          house = 100 - line - bingo;
        }
        game.config.config.split = { line, bingo, house };
      }
      if (options) {
        if (options.maxPlayers != null) options.maxPlayers = Math.max(2, Math.min(50, Number(options.maxPlayers) || 15));
        game.config.config.options = { ...game.config.config.options, ...options };
        if (game.round && game.round.config && game.round.config.options) {
          game.round.config.options = { ...game.round.config.options, ...options };
          if (options.sounds) game.round.config.options.sounds = game.config.config.options.sounds;
        }
        if (options.autoDrawDelay != null) setAutoDrawDelay(options.autoDrawDelay);
        if (options.sounds) {
          broadcastToPlayers({ type: "sounds_config_changed", sounds: game.config.config.options.sounds });
          broadcastToMasters({ type: "sounds_config_changed", sounds: game.config.config.options.sounds });
        }
        if (options.ballHistorySize != null) {
          const size = Math.max(2, Math.min(6, Number(options.ballHistorySize) || 3));
          game.config.config.options.ballHistorySize = size;
          if (game.round && game.round.config && game.round.config.options) game.round.config.options.ballHistorySize = size;
          broadcastToPlayers({ type: "ball_history_size_changed", size });
        }
        if (options.freeCellsPerRow != null) {
          const fpr = Math.max(1, Math.min(3, Number(options.freeCellsPerRow) || 2));
          game.config.config.options.freeCellsPerRow = fpr;
          game.config.config.options.freeCells = fpr * 4;
          broadcastToMasters({ type: "free_cells_per_row_changed", freeCellsPerRow: fpr, freeCells: fpr * 4 });
        }
        if (options.maxPlayers != null) {
          broadcastToPlayers({ type: "max_players_changed", maxPlayers: game.config.config.options.maxPlayers });
          broadcastToMasters({ type: "max_players_changed", maxPlayers: game.config.config.options.maxPlayers });
        }
      }
      if (!ALL_CONFIG.baseConfig) ALL_CONFIG.baseConfig = {};
      ALL_CONFIG.baseConfig = JSON.parse(JSON.stringify(game.config.config));
      saveLastConfig();
      pushMasterState(); pushPublicState(); pushWaitingRoomState();
      break;
    }

    case "master_apply_preset_slot": {
      if (ws.role !== "master") return;
      const slot = Number(msg.slot);
      if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_PRESETS) return;
      const preset = ALL_CONFIG.presets?.[slot];
      if (!preset || !preset.name) { send(ws, { type: "master_error", message: "Slot vacío" }); return; }
      lock.applyPreset(game.config, preset);
      if (!ALL_CONFIG.baseConfig) ALL_CONFIG.baseConfig = {};
      ALL_CONFIG.baseConfig = JSON.parse(JSON.stringify(game.config.config));
      saveLastConfig();
      pushMasterState();
      send(ws, { type: "master_preset_applied", slot, name: preset.name });
      break;
    }

    case "master_save_preset_slot": {
      if (ws.role !== "master") return;
      const slot = Number(msg.slot);
      if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_PRESETS) return;
      if (!ALL_CONFIG.presets) ALL_CONFIG.presets = [];
      const snapshot = JSON.parse(JSON.stringify(game.config.config));
      ALL_CONFIG.presets[slot] = {
        name: msg.name || ("Slot " + (slot + 1)),
        icon: msg.icon || "⭐",
        entryFee: snapshot.entryFee,
        split: snapshot.split,
        options: snapshot.options
      };
      while (ALL_CONFIG.presets.length < MAX_PRESETS) ALL_CONFIG.presets.push(null);
      saveLastConfig();
      pushMasterState();
      send(ws, { type: "master_preset_saved", slot, name: ALL_CONFIG.presets[slot].name });
      break;
    }

    case "master_clear_preset_slot": {
      if (ws.role !== "master") return;
      const slot = Number(msg.slot);
      if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_PRESETS) return;
      if (!ALL_CONFIG.presets) ALL_CONFIG.presets = [];
      ALL_CONFIG.presets[slot] = null;
      saveLastConfig();
      pushMasterState();
      send(ws, { type: "master_preset_cleared", slot });
      break;
    }

    case "master_rename_preset_slot": {
      if (ws.role !== "master") return;
      const slot = Number(msg.slot);
      if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_PRESETS) return;
      const preset = ALL_CONFIG.presets?.[slot];
      if (!preset) { send(ws, { type: "master_error", message: "Slot vacío" }); return; }
      if (msg.name) preset.name = String(msg.name).slice(0, 30);
      if (msg.icon) preset.icon = String(msg.icon).slice(0, 4);
      saveLastConfig();
      pushMasterState();
      break;
    }

    case "master_reset_to_base": {
      if (ws.role !== "master") return;
      lock.resetToBase(game.config, BASE_CONFIG);
      setAutoDrawDelay(BASE_CONFIG.options.autoDrawDelay || 3);
      pushMasterState();
      break;
    }

    case "master_save_as_base": {
      if (ws.role !== "master") return;
      if (!ALL_CONFIG) ALL_CONFIG = { baseConfig: {}, presets: [] };
      ALL_CONFIG.baseConfig = JSON.parse(JSON.stringify(game.config.config));
      if (!ALL_CONFIG.presets) ALL_CONFIG.presets = [];
      saveLastConfig();
      send(ws, { type: "master_saved" });
      break;
    }

    case "master_toggle_auto_draw": {
      if (ws.role !== "master") return;
      if (game.autoDraw.enabled) stopAutoDraw();
      else startAutoDraw();
      break;
    }

    case "master_set_auto_delay": {
      if (ws.role !== "master") return;
      setAutoDrawDelay(msg.delay);
      game.config.config.options.autoDrawDelay = game.autoDraw.delay;
      pushMasterState();
      break;
    }

    case "master_set_free_cells_per_row": {
      if (ws.role !== "master") return;
      const fpr = Math.max(1, Math.min(3, Number(msg.freeCellsPerRow) || 2));
      const totalFc = fpr * 4;
      game.config.config.options.freeCellsPerRow = fpr;
      game.config.config.options.freeCells = totalFc;
      if (!ALL_CONFIG.baseConfig) ALL_CONFIG.baseConfig = {};
      if (!ALL_CONFIG.baseConfig.options) ALL_CONFIG.baseConfig.options = {};
      ALL_CONFIG.baseConfig.options.freeCellsPerRow = fpr;
      ALL_CONFIG.baseConfig.options.freeCells = totalFc;
      saveLastConfig();
      broadcastToMasters({ type: "free_cells_per_row_changed", freeCellsPerRow: fpr, freeCells: totalFc });
      pushMasterState();
      break;
    }

    case "master_set_balls_per_column": {
      if (ws.role !== "master") return;
      const balls = Number(msg.ballsPerColumn) || 15;
      game.config.config.options.ballsPerColumn = balls;
      if (!ALL_CONFIG.baseConfig) ALL_CONFIG.baseConfig = {};
      if (!ALL_CONFIG.baseConfig.options) ALL_CONFIG.baseConfig.options = {};
      ALL_CONFIG.baseConfig.options.ballsPerColumn = balls;
      saveLastConfig();
      pushMasterState();
      break;
    }

    case "master_set_unattended_mode": {
      if (ws.role !== "master") return;
      const mode = String(msg.mode || "off");
      if (!["off", "free"].includes(mode)) { send(ws, { type: "master_error", message: "Modo inválido" }); return; }
      const oldMode = game.config.config.options.unattendedMode;
      if (oldMode !== "off" && mode === "off") {
        cancelWaitingRoomCountdown("mode_disabled");
        getApprovedPlayers().forEach(p => { p.readyForNextRound = false; });
      }
      game.config.config.options.unattendedMode = mode;
      if (game.round && game.round.config && game.round.config.options) game.round.config.options.unattendedMode = mode;
      if (!ALL_CONFIG.baseConfig) ALL_CONFIG.baseConfig = {};
      if (!ALL_CONFIG.baseConfig.options) ALL_CONFIG.baseConfig.options = {};
      ALL_CONFIG.baseConfig.options.unattendedMode = mode;
      saveLastConfig();
      pushMasterState(); pushWaitingRoomState();
      send(ws, { type: "master_unattended_mode_set", mode });
      break;
    }

    case "master_set_unattended_countdown": {
      if (ws.role !== "master") return;
      const secs = Math.max(5, Math.min(120, Number(msg.seconds) || 30));
      game.config.config.options.unattendedCountdown = secs;
      if (!ALL_CONFIG.baseConfig) ALL_CONFIG.baseConfig = {};
      if (!ALL_CONFIG.baseConfig.options) ALL_CONFIG.baseConfig.options = {};
      ALL_CONFIG.baseConfig.options.unattendedCountdown = secs;
      saveLastConfig();
      pushMasterState();
      send(ws, { type: "master_unattended_countdown_set", seconds: secs });
      break;
    }

    case "master_set_unattended_resume_countdown": {
      if (ws.role !== "master") return;
      const secs = Math.max(5, Math.min(120, Number(msg.seconds) || 10));
      game.config.config.options.unattendedResumeCountdown = secs;
      if (!ALL_CONFIG.baseConfig) ALL_CONFIG.baseConfig = {};
      if (!ALL_CONFIG.baseConfig.options) ALL_CONFIG.baseConfig.options = {};
      ALL_CONFIG.baseConfig.options.unattendedResumeCountdown = secs;
      saveLastConfig();
      pushMasterState();
      send(ws, { type: "master_unattended_resume_countdown_set", seconds: secs });
      break;
    }

    case "master_force_start_from_waiting": {
      if (ws.role !== "master") return;
      cancelWaitingRoomCountdown("master_force_start");
      const approved = getApprovedPlayers();
      if (approved.length < 1) { send(ws, { type: "master_error", message: "Sin jugadores" }); return; }
      autoStartRoundFromWaitingRoom(true);
      break;
    }

    case "master_start_round": {
      if (ws.role !== "master") return;
      startNewRound(msg.roundType || "real", ws);
      break;
    }

    case "master_draw_ball": {
      if (ws.role !== "master") return;
      drawBall();
      break;
    }

    case "master_pause_round": {
      if (ws.role !== "master") return;
      if (game.round) {
        if (game.round.pausedFor) { send(ws, { type: "master_error", message: "Ronda pausada por claim" }); return; }
        const goingToPause = game.round.status === "playing";
        if (goingToPause) {
          game.autoDraw.wasActiveBeforeManualPause = game.autoDraw.enabled;
          if (game.autoDraw.enabled) {
            if (game.autoDraw.timer) { clearTimeout(game.autoDraw.timer); game.autoDraw.timer = null; }
            game.autoDraw.enabled = false;
          }
          game.round.status = "paused_manual";
        } else {
          game.round.status = "playing";
          if (game.autoDraw.wasActiveBeforeManualPause) {
            game.autoDraw.wasActiveBeforeManualPause = false;
            if (!game.autoDraw.enabled) { game.autoDraw.enabled = true; scheduleNextAutoBall(); }
          }
        }
        pushMasterState();
        broadcastToPlayers({
          type: "round_status",
          status: game.round.status === "paused_manual" ? "paused" : "playing",
          reason: "manual"
        });
      }
      break;
    }

    case "master_force_resume": {
      if (ws.role !== "master") return;
      if (!game.round || !game.round.awaitingReady) return;
      autoResumeFromReady();
      break;
    }

    case "master_end_round": {
      if (ws.role !== "master") return;
      if (game.autoDraw.enabled) stopAutoDraw();
      endRound("manual_end");
      break;
    }

    case "master_new_round": {
      if (ws.role !== "master") return;
      prepareNewRound(ws);
      break;
    }

    case "master_close_claim_window": {
      if (ws.role !== "master") return;
      closeClaimWindow();
      break;
    }

    case "master_resolve_claim": {
      if (ws.role !== "master") return;
      resolveClaim(msg.playerId, msg.valid);
      break;
    }

    case "master_reject_claim": {
      if (ws.role !== "master") return;
      if (!game.round) return;
      const p = game.players.find(pl => pl.id === msg.playerId);
      if (!p) return;
      if (game.round.claimWindow && game.round.claimWindow.open) {
        if (msg.claim === "line") p.lineClaimValid = false;
        if (msg.claim === "bingo") p.bingoClaimValid = false;
        pushMasterState();
        return;
      }
      game.round.pausedFor = null;
      game.round.status = "playing";
      moderation.recordFalseAlarm(p);
      broadcastToPlayers({
        type: "round_status", status: "playing",
        reason: msg.claim + "_resolved", valid: false, playerName: p.name,
        message: `❌ ${msg.claim.toUpperCase()} inválido de ${p.name}`
      });
      broadcastToMasters({
        type: "claim_validated", claim: msg.claim, valid: false,
        playerId: p.id, playerName: p.name,
        amount: game.round.pool.breakdown[msg.claim], state: getMasterState()
      });
      resumeAutoAfterClaim();
      pushMasterState(); pushPublicState();
      break;
    }

    case "master_start_demo": {
      if (ws.role !== "master") return;
      startDemo(msg.scenario || "5bots", msg.options || {});
      break;
    }

    case "master_stop_demo": {
      if (ws.role !== "master") return;
      stopDemo();
      break;
    }

    case "player_ready": {
      if (ws.role !== "player") return;
      const p = game.players.find(pl => pl.ws === ws);
      if (!p || p.status !== "approved") return;
      if (!game.round || !game.round.readyPlayers) return;
      game.round.readyPlayers.add(p.id);
      checkAllReady();
      break;
    }

    case "player_ready_for_next_round": {
      if (ws.role !== "player") return;
      const p = game.players.find(pl => pl.ws === ws);
      if (!p || p.status !== "approved") return;
      if (p.readyForNextRound) return;
      p.readyForNextRound = true;
      pushWaitingRoomState();
      if (isAllReady() || isCupoFull()) startWaitingRoomCountdown();
      break;
    }

    case "player_mark_paid": {
      if (ws.role !== "player") return;
      if (!game.awaitingPayout.active) return;
      const p = game.players.find(pl => pl.ws === ws);
      if (!p) return;
      const winner = game.awaitingPayout.winners.find(w => w.playerId === p.id);
      if (!winner) {
        if (p.isBot) { game.awaitingPayout.paidIds.add(p.id); checkAllPayoutsDone(); }
        return;
      }
      if (game.awaitingPayout.paidIds.has(p.id)) return;
      game.awaitingPayout.paidIds.add(p.id);
      broadcastToMasters({
        type: "payout_progress", paid: game.awaitingPayout.paidIds.size,
        total: game.awaitingPayout.winners.length,
        winners: game.awaitingPayout.winners.map(w => ({ ...w, paid: game.awaitingPayout.paidIds.has(w.playerId) })),
        state: getMasterState()
      });
      broadcastToPlayers({
        type: "payout_progress", paid: game.awaitingPayout.paidIds.size,
        total: game.awaitingPayout.winners.length
      });
      checkAllPayoutsDone();
      break;
    }

    case "player_claim_paid": {
      if (ws.role !== "player") return;
      const p = game.players.find(pl => pl.ws === ws);
      if (!p) return;
      if (!game.round || !game.round.readyPlayers) return;
      ["line", "bingo"].forEach(claimType => {
        const w = game.round.winners?.[claimType];
        if (!w || !w.winners) return;
        const item = w.winners.find(x => x.playerId === p.id);
        if (item && !item.paid) { item.paid = true; item.paidAt = Date.now(); }
      });
      game.round.readyPlayers.add(p.id);
      checkAllReady();
      break;
    }

    case "player_leave": {
      if (ws.role !== "player") return;
      const p = game.players.find(pl => pl.ws === ws);
      if (!p) return;
      p.status = "left";
      send(ws, { type: "you_left" });
      removeWinnerFromAwaitingPayout(p.id);
      if (p.lineClaim) p.lineClaim = null;
      if (p.bingoClaim) p.bingoClaim = null;
      if (game.round && game.round.pendingClaims) {
        const item = game.round.pendingClaims.list.find(x => x.playerId === p.id);
        if (item && item.resolved === null) {
          item.resolved = false;
          if (game.round.pendingClaims.list.every(x => x.resolved !== null)) finalizePendingClaims();
        }
      }
      pushMasterState(); pushWaitingRoomState();
      break;
    }

    case "player_mark": {
      if (ws.role !== "player") return;
      const p = game.players.find(pl => pl.ws === ws);
      if (!p || p.status !== "approved") return;
      const { cardIndex, row, col } = msg;
      const card = p.cards[cardIndex];
      if (!card) return;
      const num = card.numbers[row]?.[col];
      if (num === undefined || num === "FREE") return;
      const called = game.round?.calledBalls.some(b => b.number === num);
      if (!called) { send(ws, { type: "mark_invalid", message: "Número no cantado" }); return; }
      card.marked[row][col] = true;
      send(ws, { type: "mark_ok", cardIndex, row, col });
      broadcastToMasters({ type: "player_marked", playerId: p.id, playerName: p.name });
      break;
    }

    case "player_claim_line": { if (ws.role !== "player") return; handlePlayerClaim(ws, "line"); break; }
    case "player_claim_bingo": { if (ws.role !== "player") return; handlePlayerClaim(ws, "bingo"); break; }

    case "player_modal_open": {
      if (ws.role !== "player") return;
      const p = game.players.find(pl => pl.ws === ws);
      if (!p) return;
      game.modalOpen.count++;
      game.modalOpen.lastPlayerName = p.name;
      pauseAutoForModal();
      if (game.modalOpen.timer) clearTimeout(game.modalOpen.timer);
      game.modalOpen.timer = setTimeout(() => {
        game.modalOpen.count = Math.max(0, game.modalOpen.count - 1);
        if (game.modalOpen.count === 0) resumeAutoFromModal();
        game.modalOpen.timer = null;
        broadcastToPlayers({ type: "force_close_modal" });
        pushMasterState();
      }, 5000);
      pushMasterState();
      break;
    }

    case "player_modal_close": {
      if (ws.role !== "player") return;
      const p = game.players.find(pl => pl.ws === ws);
      if (!p) return;
      game.modalOpen.count = Math.max(0, game.modalOpen.count - 1);
      if (game.modalOpen.count === 0) {
        if (game.modalOpen.timer) { clearTimeout(game.modalOpen.timer); game.modalOpen.timer = null; }
        resumeAutoFromModal();
      }
      pushMasterState();
      break;
    }
  }
}

function handlePlayerClaim(ws, claimType, directPlayer = null) {
  const p = directPlayer || game.players.find(pl => pl.ws === ws);
  if (!p || p.status !== "approved" || !game.round || game.round.type === "practice") {
    if (ws) send(ws, { type: "claim_rejected", reason: "No claim allowed" });
    return;
  }
  if (claimType === "line" && game.round.winners.line) return;
  if (claimType === "bingo" && game.round.winners.bingo) {
    if (ws) send(ws, { type: "claim_rejected", reason: "BINGO ya ganado" }); return;
  }
  if (claimType === "line" && p.lineClaim) { if (ws) send(ws, { type: "claim_rejected", reason: "Ya reclamaste LINEA" }); return; }
  if (claimType === "bingo" && p.bingoClaim) { if (ws) send(ws, { type: "claim_rejected", reason: "Ya reclamaste BINGO" }); return; }

  const card = p.cards[0];
  if (!card) { if (ws) send(ws, { type: "claim_rejected", reason: "Sin cartón" }); return; }

  const isWindowOpen = game.round.claimWindow && game.round.claimWindow.open;
  const lastBall = isWindowOpen ? game.round.claimWindow.lastBall : game.round.calledBalls[game.round.calledBalls.length - 1];
  const lastNum = lastBall?.number || null;

  const cardNumbers = card.numbers.flat().filter(n => n !== "FREE");
  const hasLastBall = lastNum != null ? cardNumbers.some(n => Number(n) === Number(lastNum)) : false;

  let isValid = false;
  if (claimType === "line") isValid = !!cards.validateLine(card, game.round.calledBalls);
  else if (claimType === "bingo") isValid = !!cards.validateBingo(card, game.round.calledBalls);

  if (!isValid) {
    moderation.recordFalseAlarm(p);
    if (ws) send(ws, { type: "claim_rejected", reason: `${claimType.toUpperCase()} inválido` });
    broadcastToMasters({ type: "claim_rejected_auto", claim: claimType, playerId: p.id, playerName: p.name, reason: "invalid_card" });
    return;
  }

  if (isWindowOpen && !hasLastBall && !p.isBot) {
    if (ws) send(ws, { type: "claim_rejected", reason: `Tu ${claimType.toUpperCase()} es válido pero no usaste la bola ${lastNum}` });
    return;
  }

  const claimWindowSecs = game.config.config.options.claimWindow || 15;
  if (claimType === "line") p.lineClaim = Date.now();
  if (claimType === "bingo") p.bingoClaim = Date.now();
  p.lineClaimValid = null;
  p.bingoClaimValid = null;

  game.autoDraw.wasActiveBeforeClaim = game.autoDraw.enabled;
  if (game.autoDraw.enabled) {
    if (game.autoDraw.timer) { clearTimeout(game.autoDraw.timer); game.autoDraw.timer = null; }
    game.autoDraw.enabled = false;
    pushMasterState();
  }

  openClaimWindow(claimType, claimWindowSecs);
  broadcastToMasters({
    type: "claim_received_auto", claim: claimType,
    playerId: p.id, playerName: p.name, autoValid: true, lastBall
  });
  pushMasterState();
  if (ws) send(ws, { type: "claim_sent", claim: claimType });
}

function openClaimWindow(claimType, seconds) {
  game.round.pausedFor = claimType;
  game.round.status = "paused";
  const lastBall = game.round.calledBalls[game.round.calledBalls.length - 1] || null;
  const lastNum = lastBall?.number || null;
  let eligibleIds = [];
  if (lastNum != null) {
    game.players.forEach(p => {
      if (p.role === "master" || p.role === "display") return;
      if (p.status !== "approved") return;
      const card = p.cards[0];
      if (!card) return;
      const flat = card.numbers.flat().filter(n => n !== "FREE");
      if (flat.some(n => Number(n) === Number(lastNum))) eligibleIds.push(p.id);
    });
  }
  game.round.claimWindow = { open: true, claimType, endsAt: Date.now() + seconds * 1000, seconds, lastBall };
  broadcastToPlayers({
    type: "claim_window_opened", claim: claimType, seconds, lastBall, eligibleIds,
    claimerName: game.players.find(p =>
      (claimType === "line" && p.lineClaim) || (claimType === "bingo" && p.bingoClaim)
    )?.name || "Alguien"
  });
  broadcastToMasters({ type: "claim_window_opened", claim: claimType, seconds, lastBall, eligibleIds });
  pushMasterState(); pushPublicState();
  if (!game.round.claimWindowTimer) {
    game.round.claimWindowTimer = setTimeout(() => closeClaimWindow(), seconds * 1000);
  }
}

function closeClaimWindow() {
  if (!game.round || !game.round.claimWindow || !game.round.claimWindow.open) return;
  if (game.round.claimWindowTimer) { clearTimeout(game.round.claimWindowTimer); game.round.claimWindowTimer = null; }
  game.round.claimWindow.open = false;
  const claimType = game.round.pausedFor;
  const lastBall = game.round.claimWindow.lastBall;
  const lastNum = lastBall?.number || null;
  const claimers = game.players.filter(p => {
    if (p.role === "master" || p.role === "display") return;
    if (claimType === "line") return !!p.lineClaim;
    if (claimType === "bingo") return !!p.bingoClaim;
    return false;
  });
  const pending = claimers.map(p => {
    const card = p.cards[0];
    let autoValid = false, hasLastBall = false;
    if (card) {
      autoValid = claimType === "line"
        ? !!cards.validateLine(card, game.round.calledBalls)
        : !!cards.validateBingo(card, game.round.calledBalls);
      if (lastNum != null) {
        const flat = card.numbers.flat().filter(n => n !== "FREE");
        hasLastBall = flat.some(n => Number(n) === Number(lastNum));
      }
    }
    const autoModeActive = game.autoDraw?.enabled === true || game.autoDraw?.wasActiveBeforeClaim === true;
    let resolved;
    if (!autoValid) resolved = false;
    else if (hasLastBall || autoModeActive) resolved = true;
    else resolved = null;
    return { playerId: p.id, playerName: p.name, autoValid, hasLastBall, resolved };
  });
  game.round.pendingClaims = { claim: claimType, list: pending, startedAt: Date.now(), reminderTimer: null };
  if (pending.every(x => x.resolved !== null)) { finalizePendingClaims(); return; }
  broadcastToMasters({
    type: "claim_window_closed_pending", claim: claimType, claimers: pending,
    totalPrize: game.round.pool.breakdown[claimType], state: getMasterState()
  });
  broadcastToPlayers({
    type: "claim_pending_verification", claim: claimType,
    count: pending.filter(x => x.resolved === null).length
  });
  pushMasterState(); pushPublicState();
}

function startNewRound(type, masterWs) {
  if (game.round && game.round.status === "playing") {
    if (masterWs) send(masterWs, { type: "master_error", message: "Ronda en curso" });
    return;
  }
  const approved = game.players.filter(p =>
    p.role !== "master" && p.role !== "display" &&
    p.status === "approved" && p.paid === true
  );
  if (approved.length < 1) {
    if (masterWs) send(masterWs, { type: "master_error", message: "Sin jugadores" });
    return;
  }
  const freeCellsPerRowOpt = Math.max(1, Math.min(3, Number(game.config.config.options.freeCellsPerRow) || 2));
  const freeCellsOpt = freeCellsPerRowOpt * 4;
  const currentBallsPerCol = game.config.config.options.ballsPerColumn || 15;

  approved.forEach(p => {
    p.cards = [cards.generateCard({ freeCells: freeCellsOpt, freeCellsPerRow: freeCellsPerRowOpt, ballsPerColumn: currentBallsPerCol })];
    p.lineClaim = null; p.bingoClaim = null;
    p.lineClaimValid = null; p.bingoClaimValid = null;
    p.stats.roundsPlayed++;
    send(p.ws, {
      type: "your_cards", cards: p.cards, roundType: type,
      sounds: game.config.config.options.sounds || null,
      freeCells: freeCellsOpt, freeCellsPerRow: freeCellsPerRowOpt, ballsPerColumn: currentBallsPerCol
    });
  });

  const cfg = game.config.config;
  const poolInfo = economy.calculatePool(approved.length, cfg, game.carryOver);
  game.round = {
    number: (game.round?.number || 0) + 1,
    type, status: "playing", balls: makeBallsShuffled(),
    calledBalls: [], startedAt: Date.now(),
    config: JSON.parse(JSON.stringify(cfg)),
    pool: poolInfo,
    winners: { line: null, bingo: null },
    pausedFor: null, claimWindow: null, pendingClaims: null,
    readyPlayers: new Set(), awaitingReady: false
  };
  broadcastToMasters({ type: "round_started", round: game.round, state: getMasterState() });
  broadcastToPlayers({
    type: "round_started", barName: BAR_NAME, roundType: type,
    pool: type === "practice" ? null : poolInfo,
    sounds: game.config.config.options.sounds || null, lastBall: null,
    freeCells: (cfg.options.freeCellsPerRow || 2) * 4,
    freeCellsPerRow: cfg.options.freeCellsPerRow || 2,
    ballHistorySize: cfg.options.ballHistorySize || 3
  });
  approved.forEach(p => { p.readyForNextRound = false; });
  if (game.autoDraw.enabled) scheduleNextAutoBall();
  pushWaitingRoomState();
}

function makeBallsShuffled() {
  const all = [];
  const perCol = game.config.config.options.ballsPerColumn || 15;
  const totalBalls = perCol * 5;
  for (let i = 1; i <= totalBalls; i++) {
    let letter;
    if (i <= perCol) letter = "B";
    else if (i <= perCol * 2) letter = "I";
    else if (i <= perCol * 3) letter = "N";
    else if (i <= perCol * 4) letter = "G";
    else letter = "O";
    all.push({ letter, number: i });
  }
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}

function drawBall() {
  if (!game.round) return;
  if (game.round.pausedFor) return;
  if (game.round.status !== "playing") return;
  if (game.modalOpen.count > 0) return;
  const ball = game.round.balls.pop();
  if (!ball) {
    if (game.round.winners.bingo || game.players.filter(p => p.status === "approved").length === 0) {
      endRound("no_more_balls");
      return;
    }
    if (game.autoDraw.enabled) {
      if (game.autoDraw.timer) clearTimeout(game.autoDraw.timer);
      game.autoDraw.enabled = false;
    }
    broadcastToMasters({ type: "master_error", message: "⚠️ Bombo agotado sin BINGO" });
    broadcastToPlayers({ type: "round_status", status: "ended", reason: "no_more_balls", message: "Sin bolas. Ronda termina." });
    endRound("no_more_balls");
    return;
  }
  game.round.calledBalls.push(ball);
  broadcastToMasters({ type: "ball_drawn", ball, state: getMasterState() });
  broadcastToPlayers({ type: "ball_drawn", ball });
  pushPublicState();
  triggerBots();
}

function endRound(reason) {
  if (!game.round) return;
  if (game.round.status === "ended") return;
  game.round.pausedFor = null;
  if (game.round.claimWindowTimer) { clearTimeout(game.round.claimWindowTimer); game.round.claimWindowTimer = null; }
  game.round.claimWindow = null;
  if (game.round.pendingClaims && game.round.pendingClaims.reminderTimer) {
    clearInterval(game.round.pendingClaims.reminderTimer);
    game.round.pendingClaims.reminderTimer = null;
  }
  game.round.pendingClaims = null;
  game.modalOpen.count = 0;
  game.modalOpen.lastPlayerName = null;
  if (game.modalOpen.timer) { clearTimeout(game.modalOpen.timer); game.modalOpen.timer = null; }
  game.autoDraw.pausedForModal = false;
  broadcastToPlayers({ type: "force_close_modal" });
  game.round.status = "ended";
  game.round.endedAt = Date.now();
  game.round.endReason = reason;
  if (!game.round.winners.bingo && game.round.type === "real" && game.round.config.options.carryOverBingo) {
    game.carryOver += economy.calculateCarryOver(game.round.pool.players, game.round.config);
  } else if (game.round.winners.bingo) {
    game.carryOver = 0;
  }
  game.round.remainingBalls = game.round.balls.map(b => ({ letter: b.letter, number: b.number }));
  broadcastToMasters({ type: "round_ended", round: game.round, state: getMasterState() });
  broadcastToPlayers({ type: "round_ended", round: game.round, reason });
  pushPublicState();
  if (game.round) { game.round.calledBalls = []; game.round.lastBall = null; }
  pushMasterState();
  if (game.awaitingPayout.countdownTimer) { clearTimeout(game.awaitingPayout.countdownTimer); game.awaitingPayout.countdownTimer = null; }
  game.awaitingPayout.active = false;
  game.awaitingPayout.claimType = null;
  game.awaitingPayout.winners = [];
  game.awaitingPayout.paidIds = new Set();
  game.awaitingPayout.countdownEndsAt = null;
  setTimeout(() => {
    pushWaitingRoomState();
    const botsList = game.players.filter(p => p.isBot && p.status === "approved");
    if (botsList.length > 0) {
      setTimeout(() => {
        botsList.forEach(bot => { bot.readyForNextRound = true; });
        pushWaitingRoomState();
        if (isAllReady() || isCupoFull()) startWaitingRoomCountdown();
      }, 1500);
    } else if (isAllReady() || isCupoFull()) {
      startWaitingRoomCountdown();
    }
  }, 500);
}

function prepareNewRound(masterWs) {
  if (game.round && game.round.status === "playing") endRound("prepare_new");
  game.modalOpen.count = 0;
  if (game.round?.pendingClaims?.reminderTimer) clearInterval(game.round.pendingClaims.reminderTimer);
  game.modalOpen.lastPlayerName = null;
  if (game.modalOpen.timer) { clearTimeout(game.modalOpen.timer); game.modalOpen.timer = null; }
  game.autoDraw.pausedForModal = false;
  broadcastToPlayers({ type: "force_close_modal" });
  game.players.forEach(p => {
    if (p.role === "master" || p.role === "display") return;
    if (p.status === "approved") p.status = "pending";
    p.paid = false;
    p.cards = [];
    p.lineClaim = null; p.bingoClaim = null;
    p.lineClaimValid = null; p.bingoClaimValid = null;
    p.readyForNextRound = false;
  });
  game.round = null;
  broadcastToPlayers({ type: "new_round_preparing", message: "Esperando al host" });
  if (game.awaitingPayout.countdownTimer) { clearTimeout(game.awaitingPayout.countdownTimer); game.awaitingPayout.countdownTimer = null; }
  game.awaitingPayout.active = false;
  game.awaitingPayout.claimType = null;
  game.awaitingPayout.winners = [];
  game.awaitingPayout.paidIds = new Set();
  game.awaitingPayout.countdownEndsAt = null;
  pushMasterState(); pushPublicState();
}

function resolveClaim(playerId, valid) {
  if (!game.round || !game.round.pendingClaims) return false;
  const claimType = game.round.pendingClaims.claim;
  const item = game.round.pendingClaims.list.find(x => x.playerId === playerId);
  if (!item || item.resolved !== null) return false;
  const p = game.players.find(pl => pl.id === playerId);
  if (!p) return false;
  if (valid && !item.autoValid) {
    broadcastToMasters({ type: "master_error", message: `⚠️ Cartón de ${p.name} NO válido` });
    return false;
  }
  item.resolved = !!(valid && item.autoValid);
  if (item.resolved) {
    // ok
  } else {
    moderation.recordFalseAlarm(p);
  }
  if (game.round.pendingClaims.list.every(x => x.resolved !== null)) finalizePendingClaims();
  else {
    broadcastToMasters({
      type: "claim_window_closed_pending", claim: claimType,
      claimers: game.round.pendingClaims.list,
      totalPrize: game.round.pool.breakdown[claimType], state: getMasterState()
    });
    pushMasterState();
  }
  return true;
}

function checkAllReady() {
  if (!game.round || !game.round.awaitingReady) return;
  const approved = game.players.filter(p =>
    p.role !== "master" && p.role !== "display" &&
    p.status === "approved" && p.paid === true
  );
  const totalApproved = approved.length;
  const readyCount = approved.filter(p => game.round.readyPlayers && game.round.readyPlayers.has(p.id)).length;
  broadcastToMasters({ type: "ready_progress", ready: readyCount, total: totalApproved });
  broadcastToPlayers({ type: "ready_progress", ready: readyCount, total: totalApproved });
  if (readyCount >= totalApproved && totalApproved > 0) autoResumeFromReady();
}

function autoResumeFromReady() {
  if (!game.round || !game.round.awaitingReady) return;
  game.round.awaitingReady = false;
  game.round.readyPlayers = new Set();
  game.round.status = "playing";
  game.round.pausedFor = null;
  if (game.autoDraw.wasActiveBeforeClaim) {
    game.autoDraw.wasActiveBeforeClaim = false;
    if (!game.autoDraw.enabled) { game.autoDraw.enabled = true; scheduleNextAutoBall(); }
  }
  broadcastToPlayers({ type: "round_status", status: "playing", reason: "all_ready", message: "▶️ Todos listos" });
  broadcastToMasters({ type: "round_status", status: "playing", reason: "all_ready" });
  pushMasterState(); pushPublicState();
}

function finalizePendingClaims() {
  if (!game.round || !game.round.pendingClaims) return;
  const claimType = game.round.pendingClaims.claim;
  const list = game.round.pendingClaims.list;
  if (game.round.pendingClaims.reminderTimer) {
    clearInterval(game.round.pendingClaims.reminderTimer);
    game.round.pendingClaims.reminderTimer = null;
  }
  const validIds = list.filter(x => x.resolved === true).map(x => x.playerId);
  const validClaimers = game.players.filter(p => validIds.includes(p.id));
  const invalidClaimers = game.players.filter(p => list.find(x => x.playerId === p.id && x.resolved === false));
  const totalPrize = game.round.pool.breakdown[claimType];
  const roundStep = game.config.config.options.splitRoundStep || 0.5;
  const split = economy.splitPrize(totalPrize, validClaimers.length, roundStep);
  const CODE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  function generateWinCode() {
    let c = "";
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return "AB-" + c;
  }
  const winnersList = validClaimers.map(p => ({
    playerId: p.id, playerName: p.name, amount: split.perWinner,
    code: generateWinCode(), paid: false
  }));
  const winnerPayload = {
    playerId: validClaimers[0]?.id || null, playerName: validClaimers[0]?.name || null,
    amount: totalPrize, shared: validClaimers.length > 1, winners: winnersList,
    perWinner: split.perWinner, totalPaid: split.totalPaid, houseExtra: split.houseExtra
  };
  if (claimType === "line") game.round.winners.line = winnerPayload;
  else game.round.winners.bingo = winnerPayload;
  validClaimers.forEach(p => { p.stats.wins++; });
  broadcastToMasters({
    type: "claim_window_closed", claim: claimType, winners: winnersList,
    invalidClaimers: invalidClaimers.map(p => ({ id: p.id, name: p.name })),
    totalPrize, perWinner: split.perWinner, totalPaid: split.totalPaid,
    houseExtra: split.houseExtra, state: getMasterState()
  });
  broadcastToPlayers({
    type: "claim_window_closed", claim: claimType,
    winners: winnersList.map(w => ({ name: w.playerName, amount: w.amount, isMe: false })),
    totalPrize, perWinner: split.perWinner
  });
  validClaimers.forEach(p => {
    const winData = winnersList.find(w => w.playerId === p.id);
    if (p.ws) {
      send(p.ws, {
        type: "you_won", claim: claimType, amount: split.perWinner,
        shared: validClaimers.length > 1, totalWinners: validClaimers.length,
        code: winData?.code || null, roundNumber: game.round.number, timestamp: Date.now()
      });
    }
    if (p.isBot && winData) { winData.paid = true; winData.paidAt = Date.now(); }
  });
  if (claimType === "bingo" && validClaimers.length > 0) {
    game.round.pausedFor = null;
    game.round.pendingClaims = null;
    game.round.claimWindow = null;
    pushPublicState();
    setTimeout(() => endRound("bingo_won"), 3000);
  } else {
    game.round.pausedFor = null;
    game.round.pendingClaims = null;
    game.round.claimWindow = null;
    game.round.status = "paused_manual";
    if (isUnattendedMode() && validClaimers.length > 0) startAwaitingPayout(claimType, winnersList);
    const autoWasOn = game.autoDraw.enabled || game.autoDraw.wasActiveBeforeClaim;
    if (!isUnattendedMode() && claimType === "line" && autoWasOn) {
      game.round.readyPlayers = new Set();
      game.round.awaitingReady = true;
      const approved = game.players.filter(p =>
        p.role !== "master" && p.role !== "display" &&
        p.status === "approved" && p.paid === true
      );
      broadcastToPlayers({ type: "awaiting_ready", claim: claimType, total: approved.length, ready: 0 });
      broadcastToMasters({ type: "awaiting_ready", claim: claimType, total: approved.length, ready: 0 });
    }
    if (!isUnattendedMode()) {
      broadcastToPlayers({
        type: "round_status", status: "paused", reason: claimType + "_resolved_waiting_resume",
        message: `${claimType.toUpperCase()} resuelto. Esperando al host...`,
        resolvedClaim: claimType, winners: winnersList,
        perWinner: split.perWinner, totalPrize, shared: validClaimers.length > 1
      });
      broadcastToMasters({ type: "claim_resolved_awaiting_resume", claim: claimType, winners: winnersList, state: getMasterState() });
    }
  }
  pushMasterState(); pushPublicState();
}

function startDemo(scenario, options) {
  if (game.demoMode) return;
  game.demoMode = true;
  const countMap = { "5bots": 5, "3bots": 3, "20bots": 20, "cinematic": 4, "stress": 20 };
  const count = countMap[scenario] || 5;
  const names = bots.pickBotNames(count);
  names.forEach(name => {
    const botData = bots.createBot(name, {
      speed: options.speed || "normal",
      fakeBingoChance: options.fakeBingoChance ?? 0.1
    });
    const id = "b_" + Math.random().toString(36).slice(2, 10);
    const player = moderation.createPlayerRecord({ id, name, ip: "bot", ws: null });
    player.isBot = true;
    player.botData = botData;
    player.paid = true;
    player.status = "approved";
    player.role = "player";
    player.readyForNextRound = true;
    game.players.push(player);
  });
  pushMasterState();
  pushWaitingRoomState();
  if (isAllReady() || isCupoFull()) startWaitingRoomCountdown();
}

function stopDemo() {
  game.demoMode = false;
  game.players = game.players.filter(p => !p.isBot);
  pushMasterState();
  pushWaitingRoomState();
}

function triggerBots() {
  if (!game.demoMode || !game.round || game.round.status !== "playing") return;
  if (game.round.pausedFor) return;
  const approvedBots = game.players.filter(p => p.isBot && p.status === "approved");
  if (approvedBots.length === 0) return;
  const lastBall = game.round.calledBalls[game.round.calledBalls.length - 1];
  if (!lastBall) return;
  approvedBots.forEach(bot => {
    if (bot.bingoClaim) return;
    const card = bot.cards[0];
    if (!card) return;
    let rowFound = -1, colFound = -1;
    for (let r = 0; r < card.numbers.length; r++) {
      for (let c = 0; c < card.numbers[r].length; c++) {
        if (card.numbers[r][c] === lastBall.number && !card.marked[r][c]) { rowFound = r; colFound = c; break; }
      }
      if (rowFound !== -1) break;
    }
    if (rowFound === -1) return;
    const reactionTime = Math.floor(Math.random() * 2000) + 1000;
    setTimeout(() => {
      if (!game.round || game.round.status !== "playing" || bot.status !== "approved") return;
      card.marked[rowFound][colFound] = true;
      const hasBingo = card.marked.every(row => row.every(v => v));
      const hasLine = checkLineForBot(card.marked);
      if (hasBingo && !bot.bingoClaim && !game.round.winners.bingo) {
        bot.bingoClaim = Date.now();
        game.round.pausedFor = "bingo";
        game.round.status = "paused";
        if (game.autoDraw.enabled) {
          clearTimeout(game.autoDraw.timer);
          game.autoDraw.timer = null;
          game.autoDraw.enabled = false;
          game.autoDraw.wasActiveBeforeClaim = true;
        }
        openClaimWindow("bingo", game.config.config.options.claimWindow || 15);
        broadcastToMasters({ type: "claim_received", claim: "bingo", playerId: bot.id, playerName: bot.name });
        pushMasterState();
      } else if (hasLine && !bot.lineClaim && !game.round.winners.line) {
        bot.lineClaim = Date.now();
        game.round.pausedFor = "line";
        game.round.status = "paused";
        if (game.autoDraw.enabled) {
          clearTimeout(game.autoDraw.timer);
          game.autoDraw.timer = null;
          game.autoDraw.enabled = false;
          game.autoDraw.wasActiveBeforeClaim = true;
        }
        openClaimWindow("line", game.config.config.options.claimWindow || 15);
        broadcastToMasters({ type: "claim_received", claim: "line", playerId: bot.id, playerName: bot.name });
        pushMasterState();
      }
    }, reactionTime);
  });
}

function checkLineForBot(marked) {
  for (let r = 0; r < marked.length; r++) if (marked[r].every(v => v)) return true;
  return false;
}

// ============================================================
//   ENDPOINTS
// ============================================================
app.get("/health", (req, res) => {
  res.json({ ok: true, bar: BAR_NAME, players: game.players.length, protocol: IS_PROD ? "https(proxy)" : "https" });
});

app.get("/qr", async (req, res) => {
  const publicUrl = ALL_CONFIG.publicUrl || null;
  const fallbackHost = req.headers.host || `localhost:${PORT}`;
  const url = publicUrl || (IS_PROD ? `https://${fallbackHost}` : `https://${fallbackHost}`);
  try {
    const dataUrl = await QRCode.toDataURL(url, { width: 400, margin: 1 });
    res.json({ qr: dataUrl, url });
  } catch (e) {
    res.status(500).json({ error: "QR generation failed" });
  }
});

app.post("/close-room", express.json(), (req, res) => {
  const pwd = req.headers["x-master-password"] || req.body?.password;
  if (pwd !== MASTER_PASSWORD) { res.status(401).json({ ok: false, error: "unauthorized" }); return; }
  if (game.autoDraw.enabled) stopAutoDraw();
  if (game.waitingRoom.countdownTimer) cancelWaitingRoomCountdown("close_room");
  game.players = game.players.filter(p => p.role === "master" || p.role === "display");
  game.round = null;
  game.carryOver = 0;
  game.sessionCode = generateSessionCode();
  ALL_CONFIG.sessionCode = game.sessionCode;
  saveLastConfig();
  broadcastToMasters({ type: "session_code", code: game.sessionCode });
  broadcastToMasters({ type: "room_closed" });
  pushMasterState(); pushPublicState(); pushWaitingRoomState();
  res.json({ ok: true, sessionCode: game.sessionCode });
});

// ============================================================
//   ARRANQUE FINAL
// ============================================================
initConfig().then(() => {
  // 1. Creamos el estado del juego
  game = {
    sessionCode: SAVED_SESSION_CODE || generateSessionCode(),
    players: [],
    round: null,
    config: lock.createSessionConfig(BASE_CONFIG),
    carryOver: 0,
    log: [],
    demoMode: false,
    waitingRoom: { countdownTimer: null, countdownEndsAt: null, countdownTick: null },
    awaitingPayout: {
      active: false, claimType: null, winners: [], paidIds: new Set(),
      countdownTimer: null, countdownEndsAt: null
    },
    autoDraw: {
      enabled: false, timer: null, delay: BASE_CONFIG.options.autoDrawDelay || 3,
      pausedForModal: false, wasActiveBeforeClaim: false, wasActiveBeforeManualPause: false
    },
    modalOpen: { count: 0, timer: null, lastPlayerName: null }
  };

  // 2. WebSocket (las rutas de Express ya están arriba)
  const wss = new WebSocket.Server({ server });

  wss.on("connection", (ws, req) => {
    const ip = req.socket.remoteAddress;
    ws.clientIp = ip;
    ws.role = "unknown";

    ws.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      handleMessage(ws, msg, ip);
    });

    ws.on("close", () => {
      if (ws.role === "player") {
        const p = game.players.find(pl => pl.ws === ws);
        if (p) {
          broadcastToMasters({ type: "master_player_disconnected", playerId: p.id, playerName: p.name });
          if (game.round && game.round.awaitingReady && game.round.readyPlayers) {
            game.round.readyPlayers.add(p.id);
            checkAllReady();
          }
          removeWinnerFromAwaitingPayout(p.id);
          pushMasterState();
          if (isUnattendedMode()) {
            pushWaitingRoomState();
            if (isAllReady() || isCupoFull()) startWaitingRoomCountdown();
          }
        }
      } else if (ws.role === "master" || ws.role === "display") {
        game.players = game.players.filter(pl => pl.ws !== ws);
      }
    });
  });

  // 3. Arrancamos el servidor
  server.listen(PORT, "0.0.0.0", () => {
    console.log("");
    console.log("╔════════════════════════════════════════════╗");
    console.log("║       🎱  ALDEA BELLA BINGO  🎱            ║");
    console.log("╠════════════════════════════════════════════╣");
    console.log(`║  🔐  ${IS_PROD ? "HTTP (proxy TLS)" : "HTTPS"}: ${PORT}`);
    console.log(`║  👑  Master:  /master                      ║`);
    console.log(`║  📺  Display: /display                     ║`);
    console.log(`║  📱  Player:  /                            ║`);
    console.log("╚════════════════════════════════════════════╝");
  });
}).catch(err => {
  console.error("❌ Error crítico arrancando el servidor:", err);
  process.exit(1);
});