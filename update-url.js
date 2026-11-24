// update-url.js — Actualiza publicUrl en config.json SIN BOM
// Uso: node update-url.js https://nueva-url.ngrok-free.dev

const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "config.json");
const newUrl = process.argv[2];

if (!newUrl) {
  console.error("[X] Falta la URL. Uso: node update-url.js <url>");
  process.exit(1);
}

try {
  let raw = fs.readFileSync(CONFIG_PATH, "utf8");
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  const config = JSON.parse(raw);
  config.publicUrl = newUrl;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
  console.log("[OK] config.json actualizado (UTF-8 sin BOM).");
  console.log("     publicUrl = " + newUrl);
} catch (e) {
  console.error("[X] Error actualizando config.json:", e.message);
  process.exit(1);
}