// Moderación: filtros de nombres, notas privadas, historial

const OFFENSIVE_PATTERNS = [
  /admin/i, /root/i, /system/i, /moderator/i,
  /^(.)\1{4,}$/  // 5+ caracteres iguales (ej: "aaaaa")
];

function isOffensive(text, config) {
  const lower = String(text || "").toLowerCase();
  const words = (config && config.offensiveWords) || [];
  for (const w of words) {
    if (lower.includes(w.toLowerCase())) return true;
  }
  return false;
}
function sanitizeName(name) {
  return name
    .replace(/[<>"'`\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20)
    .toUpperCase();
}

/**
 * Crea un registro de jugador
 */
function createPlayerRecord({ id, name, ip, ws }) {
  return {
    id,
    name: sanitizeName(name),
    ip,
    ws,
    joinedAt: Date.now(),
    status: "pending",     // pending | paid | approved | rejected | kicked | banned
    paid: false,
    cards: [],
    lineClaim: null,
    bingoClaim: null,
    notes: "",
    stats: {
      roundsPlayed: 0,
      wins: 0,
      falseAlarms: 0
    },
    history: []  // último comportamiento por ronda
  };
}

/**
 * Marca a un jugador como PAID
 */
function markPaid(player) {
  player.paid = true;
  player.status = "paid";
}

/**
 * Aprueba a un jugador
 */
function approve(player) {
  if (!player.paid) return false;
  player.status = "approved";
  return true;
}

/**
 * Registra una falsa alarma
 */
function recordFalseAlarm(player) {
  player.stats.falseAlarms++;
}

module.exports = {
  isOffensive,
  sanitizeName,
  createPlayerRecord,
  markPaid,
  approve,
  recordFalseAlarm
};