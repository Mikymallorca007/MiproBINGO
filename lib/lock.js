// lib/lock.js - 100% en la nube (Supabase)
const SUPABASE_TABLE = "bingo_config";

let supabaseClient = null;

function setSupabaseClient(client) {
  supabaseClient = client;
}

// ---------- Traducción: Filas BD -> Objeto JS ----------
function rowsToConfig(rows) {
  // Si la tabla está vacía, devolvemos null
  if (!rows || rows.length === 0) return null;

  const conf = {
    baseConfig: { split: {}, options: { sounds: {} } },
    presets: [null, null, null, null, null, null]
  };

  rows.forEach(row => {
    const key = row.setting_key;
    let val = row.value_json;
    
    if (row.value_type === 'json' && typeof val === 'string') {
      try { val = JSON.parse(val); } catch(e) {}
    }
    if (row.value_type === 'boolean') val = (val === 'true' || val === true);
    if (['number', 'integer'].includes(row.value_type)) val = Number(val);

    switch(key) {
      case 'bar_name': conf.baseConfig.barName = val; break;
      case 'public_url': conf.publicUrl = val; break;
      case 'entry_fee': conf.baseConfig.entryFee = val; break;
      case 'split_line_pct': conf.baseConfig.split.line = val; break;
      case 'split_bingo_pct': conf.baseConfig.split.bingo = val; break;
      case 'split_house_pct': conf.baseConfig.split.house = val; break;
      case 'prize_mode': conf.baseConfig.options.prizeMode = val; break;
      case 'claim_window_seconds': conf.baseConfig.options.claimWindow = val; break;
      case 'split_round_step_eur': conf.baseConfig.options.splitRoundStep = val; break;
      case 'auto_draw_delay_seconds': conf.baseConfig.options.autoDrawDelay = val; break;
      case 'ball_history_size': conf.baseConfig.options.ballHistorySize = val; break;
      case 'free_cells_per_row': conf.baseConfig.options.freeCellsPerRow = val; break;
      case 'free_cells_total': conf.baseConfig.options.freeCells = val; break;
      case 'balls_per_column': conf.baseConfig.options.ballsPerColumn = val; break;
      case 'unattended_mode': conf.baseConfig.options.unattendedMode = val; break;
      case 'unattended_start_countdown_seconds': conf.baseConfig.options.unattendedCountdown = val; break;
      case 'unattended_resume_countdown_seconds': conf.baseConfig.options.unattendedResumeCountdown = val; break;
      
      case 'sound_voice_balls': conf.baseConfig.options.sounds.voiceBalls = val; break;
      case 'sound_applause_line': conf.baseConfig.options.sounds.applauseOnLine = val; break;
      case 'sound_applause_bingo': conf.baseConfig.options.sounds.applauseOnBingo = val; break;
      case 'sound_applause_round_start': conf.baseConfig.options.sounds.applauseOnRoundStart = val; break;
      case 'sound_play_master': conf.baseConfig.options.sounds.playOnMaster = val; break;
      case 'sound_play_players': conf.baseConfig.options.sounds.playOnPlayers = val; break;
      case 'sound_play_display': conf.baseConfig.options.sounds.playOnDisplay = val; break;
      case 'sound_volume': conf.baseConfig.options.sounds.volume = val; break;
      
      case 'preset_slot_1': conf.presets[0] = val; break;
      case 'preset_slot_2': conf.presets[1] = val; break;
      case 'preset_slot_3': conf.presets[2] = val; break;
      case 'preset_slot_4': conf.presets[3] = val; break;
      case 'preset_slot_5': conf.presets[4] = val; break;
      case 'preset_slot_6': conf.presets[5] = val; break;
    }
  });

  conf.lastConfig = JSON.parse(JSON.stringify(conf.baseConfig));
  return conf;
}

// ---------- Traducción: Objeto JS -> Filas BD ----------
function configToRows(config) {
  const rows = [];
  const base = config.baseConfig || {};
  const opts = base.options || {};
  const sounds = opts.sounds || {};

  const add = (key, val, type) => rows.push({ setting_key: key, value_json: val, value_type: type });

  add('bar_name', base.barName || 'ALDEA BELLA', 'string');
  add('public_url', config.publicUrl || '', 'string');
  add('entry_fee', base.entryFee || 0, 'number');
  add('split_line_pct', base.split?.line || 0, 'number');
  add('split_bingo_pct', base.split?.bingo || 0, 'number');
  add('split_house_pct', base.split?.house || 0, 'number');
  add('prize_mode', opts.prizeMode || 'first', 'string');
  add('claim_window_seconds', opts.claimWindow || 15, 'number');
  add('split_round_step_eur', opts.splitRoundStep || 0.5, 'number');
  add('auto_draw_delay_seconds', opts.autoDrawDelay || 3, 'number');
  add('ball_history_size', opts.ballHistorySize || 5, 'integer');
  add('free_cells_per_row', opts.freeCellsPerRow || 2, 'integer');
  add('free_cells_total', opts.freeCells || 8, 'integer');
  add('balls_per_column', opts.ballsPerColumn || 15, 'integer');
  add('unattended_mode', opts.unattendedMode || 'off', 'string');
  add('unattended_start_countdown_seconds', opts.unattendedCountdown || 30, 'integer');
  add('unattended_resume_countdown_seconds', opts.unattendedResumeCountdown || 10, 'integer');
  
  add('sound_voice_balls', sounds.voiceBalls ?? true, 'boolean');
  add('sound_applause_line', sounds.applauseOnLine ?? false, 'boolean');
  add('sound_applause_bingo', sounds.applauseOnBingo ?? true, 'boolean');
  add('sound_applause_round_start', sounds.applauseOnRoundStart ?? false, 'boolean');
  add('sound_play_master', sounds.playOnMaster ?? true, 'boolean');
  add('sound_play_players', sounds.playOnPlayers ?? true, 'boolean');
  add('sound_play_display', sounds.playOnDisplay ?? true, 'boolean');
  add('sound_volume', sounds.volume ?? 0.7, 'number');

  for (let i = 0; i < 6; i++) {
    add(`preset_slot_${i+1}`, config.presets?.[i] || null, 'json');
  }

  return rows;
}

// ---------- Carga desde Supabase ----------
async function loadConfig() {
  if (!supabaseClient) throw new Error("Supabase client no inyectado en lock.js");
  try {
    const { data, error } = await supabaseClient.from(SUPABASE_TABLE).select("*");
    if (error) throw error;
    return rowsToConfig(data);
  } catch (e) {
    console.error("❌ Error leyendo de Supabase:", e.message);
    return null;
  }
}

// ---------- Guardado en Supabase ----------
async function saveConfig(config) {
  if (!supabaseClient) return;
  try {
    const rows = configToRows(config);
    const { error } = await supabaseClient.from(SUPABASE_TABLE).upsert(rows, { onConflict: "setting_key" });
    if (error) throw error;
    console.log("☁️ Config guardada en Supabase OK");
  } catch (e) {
    console.error("❌ Error guardando en Supabase:", e.message);
  }
}

// ============================================================
//   Resto de funciones (copia y pega igual que en tu original)
// ============================================================
function createSessionConfig(baseConfig) {
  return { locked: baseConfig.options?.lockOnStart ?? true, config: JSON.parse(JSON.stringify(baseConfig)), history: [] };
}
function applyPreset(sessionState, preset) { /* ... tu código original ... */ }
function updateValue(sessionState, key, value) { /* ... tu código original ... */ }
function lock(sessionState) { /* ... tu código original ... */ }
function unlock(sessionState) { /* ... tu código original ... */ }
function resetToBase(sessionState, baseConfig) { /* ... tu código original ... */ }

module.exports = {
  setSupabaseClient,
  loadConfig,
  saveConfig,
  createSessionConfig,
  applyPreset,
  updateValue,
  lock,
  unlock,
  resetToBase
};