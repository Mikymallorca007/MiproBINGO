// ============================================================
//   ALDEA BELLA BINGO — Generador de certificado SSL
//   Usa node-forge (librería estable y probada)
//   Ejecutar UNA SOLA VEZ con:  node generate-cert.js
// ============================================================

const forge = require("node-forge");
const fs = require("fs");
const path = require("path");
const os = require("os");

function getLocalIPs() {
  const nets = os.networkInterfaces();
  const ips = ["127.0.0.1"];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

const localIPs = getLocalIPs();
console.log("🌐 IPs detectadas:", localIPs);

console.log("🔐 Generando clave RSA 2048 bits (5-15 segundos)…");
const keys = forge.pki.rsa.generateKeyPair(2048);

console.log("📜 Creando certificado X.509…");
const cert = forge.pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = "01" + Date.now().toString(16);
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date();
cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

const attrs = [
  { name: "commonName", value: "Aldea Bella Bingo" },
  { name: "organizationName", value: "Aldea Bella" },
  { name: "countryName", value: "ES" }
];
cert.setSubject(attrs);
cert.setIssuer(attrs);

const altNames = [];
localIPs.forEach(ip => {
  altNames.push({ type: 7, ip });
});
altNames.push({ type: 2, value: "aldeabella.local" });

cert.setExtensions([
  { name: "basicConstraints", cA: true },
  { name: "keyUsage", keyCertSign: true, digitalSignature: true, keyEncipherment: true },
  { name: "extKeyUsage", serverAuth: true, clientAuth: true },
  { name: "subjectAltName", altNames }
]);

cert.sign(keys.privateKey, forge.md.sha256.create());

const certPEM = forge.pki.certificateToPem(cert);
const keyPEM = forge.pki.privateKeyToPem(keys.privateKey);

const certsDir = path.join(__dirname, "certs");
if (!fs.existsSync(certsDir)) fs.mkdirSync(certsDir);

fs.writeFileSync(path.join(certsDir, "cert.pem"), certPEM, "utf8");
fs.writeFileSync(path.join(certsDir, "key.pem"), keyPEM, "utf8");

console.log("");
console.log("╔════════════════════════════════════════════╗");
console.log("║   ✅  CERTIFICADO GENERADO                 ║");
console.log("╠════════════════════════════════════════════╣");
console.log("║  📁  certs/cert.pem                        ║");
console.log("║  📁  certs/key.pem                         ║");
console.log("╠════════════════════════════════════════════╣");
console.log("║  Válido para:                              ║");
localIPs.forEach(ip => {
  console.log(`║    • https://${ip}:3000`.padEnd(45) + "║");
});
console.log("║  Válido 10 años                            ║");
console.log("╚════════════════════════════════════════════╝");
console.log("");