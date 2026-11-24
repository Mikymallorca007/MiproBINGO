// Sistema de configuración bloqueable y base persistente

const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "..", "config.json");
const CONFIG_BACKUP_PATH = path.join(__dirname, "..", "config-backup.json");

// ============================================================
//   SANITIZACIÓN — arregla cualquier BOM residual antes de guardar
// ============================================================
function sanitizeForSave(obj) {
  const json = JSON.stringify(obj, null, 2);
  // JSON.stringify NUNCA añade BOM, pero si algún string del objeto contiene
  // el carácter U+FEFF (por ejemplo pegado desde un editor), lo quitamos.
  return json.replace(/\uFEFF/g, "");
}

function loadConfig() {
  try {
    let raw = fs.readFileSync(CONFIG_PATH, "utf8");

    // Eliminar BOM UTF-8 si existe (carácter U+FEFF al inicio)
    if (raw.charCodeAt(0) === 0xFEFF) {
      console.warn("⚠️ config.json tenía BOM UTF-8 — eliminándolo en memoria");
      raw = raw.slice(1);
    }

    const parsed = JSON.parse(raw);

    // Log de confirmación
    const presetCount = Array.isArray(parsed.presets)
      ? parsed.presets.filter(Boolean).length
      : 0;
    console.log(`📂 config.json cargado OK — ${presetCount} presets`);

    return parsed;
  } catch (e) {
    console.error("❌ Error leyendo config.json:", e.message);
    console.error("   (el archivo se usará con valores por defecto)");
    return null;
  }
}

function saveConfig(config) {
  try {
    // 1. Backup del archivo actual antes de sobreescribir
    if (fs.existsSync(CONFIG_PATH)) {
      try {
        fs.copyFileSync(CONFIG_PATH, CONFIG_BACKUP_PATH);
      } catch (e) {
        console.warn("⚠️ No se pudo crear backup:", e.message);
      }
    }

    // 2. Validación: si el archivo actual tiene presets y el nuevo no,
    //    abortar para evitar perderlos por accidente.
    let currentPresetCount = 0;
    try {
      let currentRaw = fs.readFileSync(CONFIG_PATH, "utf8");
      if (currentRaw.charCodeAt(0) === 0xFEFF) currentRaw = currentRaw.slice(1);
      const current = JSON.parse(currentRaw);
      currentPresetCount = Array.isArray(current.presets)
        ? current.presets.filter(Boolean).length
        : 0;
    } catch (e) {
      // Si no se puede leer el actual, no bloqueamos (será el primer save)
    }

    const newPresetCount = Array.isArray(config.presets)
      ? config.presets.filter(Boolean).length
      : 0;

    if (currentPresetCount > 0 && newPresetCount < currentPresetCount) {
      console.error(
        `🛑 ABORTADO saveConfig: iba a borrar presets ` +
        `(${currentPresetCount} → ${newPresetCount}). ` +
        `Revisa que ALL_CONFIG.presets esté bien cargado.`
      );
      return;
    }

    // 3. Escribir SIN BOM (Node no añade BOM con "utf8")
    const jsonString = sanitizeForSave(config);
    fs.writeFileSync(CONFIG_PATH, jsonString, { encoding: "utf8", flag: "w" });
  } catch (e) {
    console.error("❌ Error guardando config.json:", e.message);
  }
}

/**
 * Crea el estado de configuración de la sesión actual
 */
function createSessionConfig(baseConfig) {
  return {
    locked: baseConfig.options?.lockOnStart ?? true,
    config: JSON.parse(JSON.stringify(baseConfig)),
    history: []
  };
}

/**
 * Aplica un preset COMPLETO sobre la config actual.
 */
function applyPreset(sessionState, preset) {
  if (!preset) return;

  if (preset.entryFee != null) {
    sessionState.config.entryFee = preset.entryFee;
  }

  if (preset.split) {
    sessionState.config.split = { ...sessionState.config.split, ...preset.split };
  }

  if (preset.options) {
    const curOpts = sessionState.config.options || {};
    const newOpts = { ...curOpts, ...preset.options };

    if (preset.options.sounds) {
      newOpts.sounds = { ...(curOpts.sounds || {}), ...preset.options.sounds };
    }

    sessionState.config.options = newOpts;
  }

  sessionState.history.push({
    time: Date.now(),
    action: "preset_applied",
    preset: preset.name || "(unnamed)",
    appliedFields: Object.keys(preset).filter(k => k !== "name" && k !== "icon")
  });
}

function updateValue(sessionState, key, value) {
  if (sessionState.locked) return false;
  sessionState.history.push({
    time: Date.now(),
    action: "change",
    key,
    old: JSON.stringify(sessionState.config[key]),
    new: JSON.stringify(value)
  });
  sessionState.config[key] = value;
  return true;
}

function lock(sessionState) {
  sessionState.locked = true;
  sessionState.history.push({ time: Date.now(), action: "lock" });
}

function unlock(sessionState) {
  sessionState.locked = false;
  sessionState.history.push({ time: Date.now(), action: "unlock" });
}

function resetToBase(sessionState, baseConfig) {
  sessionState.config = JSON.parse(JSON.stringify(baseConfig));
  sessionState.history.push({ time: Date.now(), action: "reset_to_base" });
}

module.exports = {
  loadConfig,
  saveConfig,
  createSessionConfig,
  applyPreset,
  updateValue,
  lock,
  unlock,
  resetToBase
};