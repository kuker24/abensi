const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, '../qa-screenshots/man1rohul-refs');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function screenshot(page, name, opts = {}) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, ...opts });
  console.log(`✓ ${name}.png`);
}

async function run() {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--disable-web-security'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('🔍 Menjelajahi https://man1rohul.sch.id/ ...');
  await page.goto('https://man1rohul.sch.id/', { waitUntil: 'networkidle', timeout: 30000 });
  
  // Screenshot homepage
  await screenshot(page, 'homepage-hero', { fullPage: false });
  
  // Scroll untuk lihat lebih banyak konten
  await page.evaluate(() => window.scrollBy(0, 600));
  await page.waitForTimeout(1000);
  await screenshot(page, 'homepage-section1', { fullPage: false });
  
  await page.evaluate(() => window.scrollBy(0, 600));
  await page.waitForTimeout(1000);
  await screenshot(page, 'homepage-section2', { fullPage: false });
  
  // Ambil URL semua gambar dari halaman
  const imageUrls = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    return imgs
      .map(img => ({
        src: img.src,
        alt: img.alt,
        width: img.naturalWidth,
        height: img.naturalHeight,
      }))
      .filter(img => img.src && img.src.startsWith('http') && img.width > 100);
  });
  
  console.log(`\n📸 Ditemukan ${imageUrls.length} gambar:`);
  imageUrls.slice(0, 20).forEach((img, i) => {
    console.log(`  ${i+1}. ${img.width}x${img.height} | ${img.alt || 'no-alt'} | ${img.src.substring(0, 80)}...`);
  });
  
  // Simpan daftar gambar ke file
  fs.writeFileSync(path.join(OUT_DIR, 'images.json'), JSON.stringify(imageUrls, null, 2));
  
  // Download beberapa gambar menarik (hero, gedung, siswa, kegiatan)
  const toDownload = imageUrls
    .filter(img => img.width > 400 && img.height > 200)
    .slice(0, 10);
    
  console.log(`\n⬇️ Downloading ${toDownload.length} gambar...`);
  for (let i = 0; i < toDownload.length; i++) {
    const img = toDownload[i];
    try {
      const response = await page.evaluate(async (url) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return null;
          const blob = await res.blob();
          return await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
        } catch (e) { return null; }
      }, img.src);
      
      if (response) {
        const base64 = response.split(',')[1];
        const ext = img.src.split('.').pop().split('?')[0] || 'jpg';
        const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext.toLowerCase()) ? ext : 'jpg';
        fs.writeFileSync(path.join(OUT_DIR, `ref-${i}.${safeExt}`), Buffer.from(base64, 'base64'));
        console.log(`  ✓ ref-${i}.${safeExt} (${img.width}x${img.height})`);
      }
    } catch (e) {
      console.log(`  ✗ ref-${i} failed: ${e.message}`);
    }
  }

  await browser.close();
  console.log(`\n✅ Semua referensi tersimpan di: ${OUT_DIR}`);
}

run().catch(err => { console.error(err); process.exit(1); });
