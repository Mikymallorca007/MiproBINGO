// Generación de cartones de Bingo dinámico (B-I-N-G-O) — formato 4×5
// El rango de números por columna se adapta a options.ballsPerColumn
// Sin centro fijo. FREE por fila configurable (1, 2 o 3 por fila).
// Total de FREE = 4 filas × FREE por fila.

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandom(min, max, count) {
  const pool = [];
  for (let i = min; i <= max; i++) pool.push(i);
  return shuffle(pool).slice(0, count).sort((a, b) => a - b);
}

// (funciones pickFreeCells, tryPickFreeCells, forceFillFreeCells eliminadas:
//  solo se usa pickFreeCells4x5 para cartón 4×5)

function forceFillFreeCells(total) {
  const freeCells = [[2, 2]];
  const rowCount = [0, 0, 0, 0, 0];
  const colCount = [0, 0, 0, 0, 0];
  let diagMain = 1;
  let diagSec = 1;
  rowCount[2] = 1;
  colCount[2] = 1;

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (freeCells.length >= total) return freeCells;
      if (r === 2 && c === 2) continue;
      if (rowCount[r] >= 2) continue;
      if (colCount[c] >= 2) continue;
      if (r === c && diagMain >= 2) continue;
      if (r === 4 - c && diagSec >= 2) continue;
      freeCells.push([r, c]);
      rowCount[r]++;
      colCount[c]++;
      if (r === c) diagMain++;
      if (r === 4 - c) diagSec++;
    }
  }
  return freeCells;
}

/**
 * Genera un cartón de Bingo dinámico.
 * @param {object} options
 * @param {number} options.freeCells  Número de casillas FREE (1..5).
 * @param {number} options.ballsPerColumn  Bolas por columna (5..15).
 */
function generateCard(options = {}) {
  const freeCellsPerRow = Math.max(1, Math.min(3, Number(options.freeCellsPerRow) || 2));
  const freeCellCount = freeCellsPerRow * 4; // 4 filas × FREE por fila
  const perCol = Math.max(5, Math.min(15, Number(options.ballsPerColumn) || 15));

  // Rangos dinámicos según ballsPerColumn — 4 números por columna
  const B = pickRandom(1, perCol, 4);
  const I = pickRandom(perCol + 1, perCol * 2, 4);
  const N = pickRandom(perCol * 2 + 1, perCol * 3, 4);
  const G = pickRandom(perCol * 3 + 1, perCol * 4, 4);
  const O = pickRandom(perCol * 4 + 1, perCol * 5, 4);

  // Cartón 4 filas × 5 columnas
  const numbers = [];
  for (let row = 0; row < 4; row++) {
    numbers.push([B[row], I[row], N[row], G[row], O[row]]);
  }

  // Elegir casillas FREE con preferencia por fila
  const freeCells = pickFreeCells4x5(freeCellCount, freeCellsPerRow);
  for (const [r, c] of freeCells) {
    numbers[r][c] = "FREE";
  }

  const marked = numbers.map(row => row.map(v => v === "FREE"));

  return {
    numbers,
    marked,
    freeCells,
    freeCellsPerRow,
    rows: 4,
    cols: 5
  };
}

/**
 * Elige posiciones FREE aleatorias para cartón 4×5.
 * - count: total de FREE deseadas (1..10)
 * - perRow: preferencia de máximo por fila (1..3). Si no cabe con esa preferencia,
 *   se reparte igualmente hasta llegar al total (límite duro = total).
 */
function pickFreeCells4x5(count, perRow = 2) {
  const total = Math.max(1, Math.min(12, Number(count) || 1));
  const prefPerRow = Math.max(1, Math.min(3, Number(perRow) || 2));

  // Posiciones posibles: 4 filas × 5 columnas = 20
  const all = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) all.push([r, c]);
  }

  // Intento 1: respetar la preferencia por fila si es posible
  if (total <= prefPerRow * 4) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const shuffled = shuffle(all);
      const chosen = [];
      const rowCount = [0, 0, 0, 0];

      for (const [r, c] of shuffled) {
        if (chosen.length >= total) break;
        if (rowCount[r] >= prefPerRow) continue;
        chosen.push([r, c]);
        rowCount[r]++;
      }

      if (chosen.length === total) return chosen;
    }
  }

  // Intento 2 (o si el total no cabe con la preferencia):
  // reparto "lo más uniforme posible", sin límite estricto por fila,
  // pero evitando llenar una fila antes de tocar las demás.
  const chosen = [];
  const rowCount = [0, 0, 0, 0];
  const shuffled = shuffle(all);

  // Bucle: en cada pasada intenta poner 1 FREE por fila, empezando por la que menos tiene
  while (chosen.length < total) {
    // Ordena filas por menor count (más libres primero) y desempata al azar
    const rowOrder = [0, 1, 2, 3].sort((a, b) => {
      if (rowCount[a] !== rowCount[b]) return rowCount[a] - rowCount[b];
      return Math.random() - 0.5;
    });

    let placed = false;
    for (const r of rowOrder) {
      if (chosen.length >= total) break;
      // Busca una casilla libre de la fila r
      for (const [rr, c] of shuffled) {
        if (rr !== r) continue;
        if (chosen.some(([x, y]) => x === rr && y === c)) continue;
        chosen.push([rr, c]);
        rowCount[r]++;
        placed = true;
        break;
      }
    }
    if (!placed) break; // no quedan casillas
  }

  return chosen;
}

/**
 * Comprueba si el cartón tiene línea (solo horizontales, 4×5).
 */
function hasLine(card) {
  const m = card.marked;
  for (let r = 0; r < m.length; r++) {
    if (m[r].every(v => v)) return { type: "row", index: r };
  }
  return null;
}

function hasBingo(card) {
  return card.marked.every(row => row.every(v => v));
}

function validateLine(card, calledBalls) {
  const calledSet = new Set(calledBalls.map(b => b.number));
  const m = card.numbers.map((row) =>
    row.map((v) => v === "FREE" || calledSet.has(v))
  );
  return hasLine({ marked: m });
}

function validateBingo(card, calledBalls) {
  const calledSet = new Set(calledBalls.map(b => b.number));
  const m = card.numbers.map((row) =>
    row.map((v) => v === "FREE" || calledSet.has(v))
  );
  return m.every(row => row.every(v => v));
}

module.exports = {
  generateCard,
  hasLine,
  hasBingo,
  validateLine,
  validateBingo
};