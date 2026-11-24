// Bots para modo DEMO / práctica

const BOT_NAMES = [
  "Sara", "Mike_88", "LauraBcn", "Tanaka", "Juanito",
  "Marie", "Anna_K", "Big_Dave", "Pepa89", "Carlos",
  "Marta", "Dani", "Lucas", "Nerea", "Pablo",
  "Sofia", "Hugo", "Emma", "Marc", "Carla"
];

function pickBotNames(count) {
  const shuffled = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Crea un bot como si fuera un jugador real
 */
function createBot(name, options = {}) {
  return {
    name,
    isBot: true,
    speed: options.speed || "normal",           // slow | normal | fast
    fakeBingoChance: options.fakeBingoChance ?? 0.1,
    abandonChance: options.abandonChance ?? 0.05,
    autoMark: options.autoMark ?? true,
    marked: new Map()  // qué números ha marcado (para delay humano)
  };
}

/**
 * Devuelve el delay humano que tarda el bot en marcar un número
 */
function getMarkDelay(speed) {
  switch (speed) {
    case "slow":   return 1500 + Math.random() * 2000;
    case "fast":   return 150 + Math.random() * 300;
    case "normal":
    default:       return 400 + Math.random() * 800;
  }
}

/**
 * Decide si un bot hace una falsa alarma
 */
function shouldFakeBingo(bot) {
  return Math.random() < bot.fakeBingoChance;
}

module.exports = {
  pickBotNames,
  createBot,
  getMarkDelay,
  shouldFakeBingo
};