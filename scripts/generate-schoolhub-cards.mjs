#!/usr/bin/env node
// scripts/generate-schoolhub-cards.mjs
// Generate 972x1542 SIAB2 cards with NID from VPS-verified data
// Usage: node scripts/generate-schoolhub-cards.mjs
// Expects verified card data at /tmp/siab2-card-data.json (generated via VPS SSH)

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(resolve(process.cwd(), 'apps/web/package.json'));
const { chromium } = require('playwright-core');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = '/tmp/siab2-card-data.json';
const OUTPUT_DIR = resolve(ROOT, 'Data Akun', 'simpanakun');

const CHROME_PATH = process.env.PLAYWRIGHT_CHROMIUM_PATH
  || process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1232/chrome-headless-shell-linux64/chrome-headless-shell';

if (!existsSync(DATA_FILE)) {
  console.error('ERROR: Data file not found at', DATA_FILE);
  console.error('Extract VPS data first via SSH into /tmp/siab2-card-data.json');
  process.exit(1);
}
if (!existsSync(CHROME_PATH)) {
  console.error('ERROR: Chromium headless shell not found at', CHROME_PATH);
  console.error('Set PLAYWRIGHT_CHROMIUM_PATH env or install Playwright browsers');
  process.exit(1);
}

const { cards } = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
console.log(`Loaded ${cards.length} verified cards`);

const byClass = {};
for (const c of cards) {
  const cls = c.kelas || 'UNKNOWN';
  if (!byClass[cls]) byClass[cls] = [];
  byClass[cls].push(c);
}

const classNames = Object.keys(byClass).sort();
console.log('Classes:', classNames.join(', '));
console.log('Output:', OUTPUT_DIR);

// Validate all cards
for (const c of cards) {
  if (!c.nkd || !/^\d{4}$/.test(String(c.nkd))) {
    console.error(`ERROR: card ${c.userId} has invalid nkd: ${c.nkd}`);
    process.exit(1);
  }
  if (!c.qr_value || !c.qr_value.startsWith('schoolhub:qr:v1:QR_')) {
    console.error(`ERROR: card ${c.userId} has invalid/missing QR`);
    process.exit(1);
  }
}

const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME_PATH,
  args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox']
});

const context = await browser.newContext({
  viewport: { width: 600, height: 400 },
  deviceScaleFactor: 1
});

const page = await context.newPage();

const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:#fff;width:100%;height:100%}
#c{position:fixed;left:-9999px;top:0}
.id-card{width:324px;height:514px}
</style></head><body><div id="c"></div>
<script>
async function renderCard(user){
const isSiswa=user.role==='student'||user.role==='SISWA';
const name=user.nama||'Nama belum diisi';
const nkd=user.nkd||'—';
const nis=user.nis||'—';
const nip=user.nip||'—';
const escape=v=>String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const nfs=name.length>24?16:name.length>18?18:20;
const svg=\`<svg xmlns="http://www.w3.org/2000/svg" width="53.98mm" height="85.6mm" viewBox="0 0 324 514">
<rect width="324" height="514" rx="26" fill="#eef4f8"/>
<rect x="0" y="0" width="324" height="108" fill="#fff"/>
<text x="60" y="55" fill="#071018" font-family="sans-serif" font-size="20" font-weight="900" letter-spacing="4">SIAB2</text>
<text x="60" y="73" fill="#557088" font-family="sans-serif" font-size="8" font-weight="900" letter-spacing="2">MAN 1 ROKAN HULU</text>
<rect x="0" y="108" width="324" height="210" fill="#071018"/>
<rect x="0" y="108" width="90" height="210" fill="#0d3047"/>
<rect x="234" y="108" width="90" height="210" fill="#0d3047"/>
<rect x="80" y="131" width="164" height="164" rx="28" fill="#fff"/>
<rect x="0" y="318" width="324" height="96" fill="#0d3047"/>
<text x="162" y="358" fill="#fff" text-anchor="middle" font-family="sans-serif" font-size="\${nfs}" font-weight="900" letter-spacing="1">\${escape(name.toUpperCase())}</text>
<text x="162" y="380" fill="#fff" text-anchor="middle" font-family="monospace" font-size="9" font-weight="900" letter-spacing="1.2">NIS: \${escape(isSiswa?nis:nip)}</text>
<text x="162" y="396" fill="#fff" text-anchor="middle" font-family="monospace" font-size="9" font-weight="900" letter-spacing="1.2">NID: \${escape(nkd)}</text>
<text x="162" y="410" fill="#fff" text-anchor="middle" font-family="sans-serif" font-size="10" font-weight="900" letter-spacing="1">\${isSiswa?'SISWA':'PEGAWAI'}</text>
<rect x="0" y="414" width="324" height="100" fill="#fff"/>
<text x="162" y="461" fill="#557088" text-anchor="middle" font-family="sans-serif" font-size="8" font-weight="900" letter-spacing="2">KARTU TANDA PENGENAL SIAB2</text>
<text x="162" y="487" fill="#071018" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="900" letter-spacing="0.7">MAN 1 ROKAN HULU</text>
</svg>\`;
const c=document.getElementById('c');c.innerHTML=svg;
const img=new Image();
const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
return new Promise((ok,fail)=>{
img.onload=()=>{
const cn=document.createElement('canvas');cn.width=972;cn.height=1542;
const cx=cn.getContext('2d');cx.clearRect(0,0,972,1542);cx.drawImage(img,0,0,972,1542);
cn.toBlob(b=>{if(b){const r=new FileReader();r.onloadend=()=>{c.innerHTML='';ok(r.result)};r.readAsDataURL(b)}else fail()},'image/png');
URL.revokeObjectURL(url)};
img.onerror=()=>{URL.revokeObjectURL(url);fail(new Error('img error'))};
img.src=url})}
</script></body></html>`;

await page.setContent(html);
await page.waitForFunction(() => typeof renderCard === 'function');
console.log('Browser ready, starting card generation...');

let totalCards = 0;

for (const cls of classNames) {
  const items = byClass[cls];
  const classDir = resolve(OUTPUT_DIR, cls);
  mkdirSync(classDir, { recursive: true, mode: 0o700 });

  for (let i = 0; i < items.length; i++) {
    const dataUrl = await page.evaluate(u => renderCard(u), items[i]);
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    const filepath = resolve(classDir, `kartu-siab2-${String(i+1).padStart(3,'0')}.png`);
    writeFileSync(filepath, buf);
    chmodSync(filepath, 0o600);
    totalCards++;
    if ((i+1) % 10 === 0 || i === items.length - 1) {
      process.stdout.write(`\r  ${cls}: ${i+1}/${items.length} (${(100*(i+1)/items.length).toFixed(0)}%)`);
    }
  }
}

console.log(`\n\nDone: ${totalCards} cards into ${classNames.length} class directories`);
console.log(`Output: ${OUTPUT_DIR}`);
await browser.close();
