// Creates a self-signed HTTPS certificate in backend/certs (valid for 5 years).
// Usage: npm run make-cert -- 172.16.40.4 [more hosts/IPs...]
const fs = require('fs');
const os = require('os');
const path = require('path');
const selfsigned = require('selfsigned');

const hosts = process.argv.slice(2);
const detected = Object.values(os.networkInterfaces()).flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
const names = [...new Set(['localhost', '127.0.0.1', ...detected, ...hosts])];
const isIp = (v) => /^\d+\.\d+\.\d+\.\d+$/.test(v);

(async () => {
  const pems = await selfsigned.generate([{ name: 'commonName', value: 'Studio Gear' }], {
    algorithm: 'sha256',
    keySize: 2048,
    notAfterDate: new Date(Date.now() + 5 * 365 * 24 * 3600 * 1000),
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'subjectAltName', altNames: names.map((v) => (isIp(v) ? { type: 7, ip: v } : { type: 2, value: v })) }
    ]
  });
  const dir = path.join(__dirname, 'certs');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'key.pem'), pems.private, { mode: 0o600 });
  fs.writeFileSync(path.join(dir, 'cert.pem'), pems.cert);
  console.log('Certificate created for:', names.join(', '));
})();
