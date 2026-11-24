// ============================================================
//   ALDEA BELLA BINGO — Economy
//   Cálculo de bolsa, reparto y redondeo
// ============================================================

function roundToHalf(amount) {
  return Math.round(amount * 2) / 2;
}

function roundToNearest(amount, step) {
  if (!step || step <= 0) return +amount.toFixed(2);
  return Math.floor(amount / step) * step;
}

/**
 * Calcula el reparto de la bolsa según configuración.
 */
function calculatePool(players, config, carryOver = 0) {
  const { entryFee, split, options } = config;
  const total = +(players * entryFee).toFixed(2);
  const poolForPrizes = +(total * (1 - split.house / 100)).toFixed(2);

  const lineShare = split.line / (split.line + split.bingo) || 0;
  const bingoShare = split.bingo / (split.line + split.bingo) || 0;

  let lineAmount = poolForPrizes * lineShare;
  let bingoAmount = poolForPrizes * bingoShare + carryOver;
  let houseAmount = total * (split.house / 100);

  if (options.roundToHalf) {
    lineAmount = roundToHalf(lineAmount);
    bingoAmount = roundToHalf(bingoAmount);
    houseAmount = roundToHalf(houseAmount);
  } else {
    lineAmount = +lineAmount.toFixed(2);
    bingoAmount = +bingoAmount.toFixed(2);
    houseAmount = +houseAmount.toFixed(2);
  }

  return {
    players,
    entryFee,
    totalCollected: total,
    breakdown: {
      line: lineAmount,
      bingo: bingoAmount,
      house: houseAmount
    },
    carryOverUsed: carryOver,
    carryOverRemaining: 0
  };
}

/**
 * Calcula la cantidad que quedaría en carry-over si el BINGO no se gana
 */
function calculateCarryOver(players, config) {
  const pool = calculatePool(players, config, 0);
  return pool.breakdown.bingo;
}

/**
 * Formatea una cantidad en €
 */
function formatMoney(amount) {
  return `€${amount.toFixed(2)}`;
}

/**
 * Aplica un preset sobre una config actual
 */
function applyPreset(currentConfig, preset) {
  return {
    ...currentConfig,
    entryFee: preset.entryFee,
    split: { ...preset.split }
  };
}

/**
 * Reparte un premio entre varios ganadores con redondeo hacia abajo
 * (el sobrante se lo queda el bar).
 *
 * @param {number} totalPrize       Cantidad total del premio
 * @param {number} winnersCount     Número de ganadores válidos
 * @param {number} roundStep        Redondeo hacia abajo (ej: 0.5)
 * @returns {object} { perWinner, totalPaid, houseExtra, winners }
 */
function splitPrize(totalPrize, winnersCount, roundStep = 0.5) {
  if (winnersCount <= 0) {
    return { perWinner: 0, totalPaid: 0, houseExtra: totalPrize, winners: 0 };
  }
  if (winnersCount === 1) {
    return {
      perWinner: +totalPrize.toFixed(2),
      totalPaid: +totalPrize.toFixed(2),
      houseExtra: 0,
      winners: 1
    };
  }
  const rawPerWinner = totalPrize / winnersCount;
  const perWinner = roundToNearest(rawPerWinner, roundStep);
  const totalPaid = +(perWinner * winnersCount).toFixed(2);
  const houseExtra = +(totalPrize - totalPaid).toFixed(2);
  return { perWinner, totalPaid, houseExtra, winners: winnersCount };
}

module.exports = {
  calculatePool,
  calculateCarryOver,
  roundToHalf,
  roundToNearest,
  formatMoney,
  applyPreset,
  splitPrize
};