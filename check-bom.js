// check-bom.js — Comprueba si algún JSON tiene BOM
const fs = require("fs");
const path = require("path");

const files = [
  "config.json",
  "config-backup.json",
  "config-ok.json",
  "config-RESETEADO.json",
  "package.json"
];

let found = 0;

files.forEach(file => {
  const fullPath = path.join(__dirname, file);
  if (!fs.existsSync(fullPath)) {
    console.log(`⚪ ${file} — no existe`);
    return;
  }
  const raw = fs.readFileSync(fullPath, "utf8");
  if (raw.charCodeAt(0) === 0xFEFF) {
    console.log(`🔴 ${file} — TIENE BOM`);
    found++;
  } else {
    console.log(`✅ ${file} — sin BOM`);
  }
});

console.log("");
if (found === 0) {
  console.log("🎉 Todo limpio, ningún archivo tiene BOM");
} else {
  console.log(`⚠️ ${found} archivo(s) con BOM. Ábrelos y guarda como UTF-8 sin BOM.`);
  process.exit(1);
}