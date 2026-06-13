# SchoolHub e-Hadir — UI/UX Redesign v3 Concept

## Ringkasan Audit UI/UX

### Temuan Utama
1. **Design system tidak memiliki arah desain yang tegas** — tema lama menggunakan gradasi ungu-biru yang terlalu umum untuk sekolah Islam
2. **Pale warna status tidak intuitif** — siswa/guru sekolah lebih akrab dengan hijau untuk hadir, merah untuk alpa
3. **Kontras readability perlu ditingkatkan** — terutama untuk pengguna harian (guru) di lingkungan cahaya rendah
4. **Touch target mobile belum konsisten** — beberapa area interaksi di bawah 44px
5. **CSS terlalu besar (73KB asli → 6120 baris)** — banyak unused/overlapping styles

### File yang Diubah

| File | Status | Catatan |
|------|--------|---------|
| `apps/web/src/styles.css` | Di-tulis ulang penuh | Design system v3, 1780 baris (dari 6120), CSS bundle ~49KB gzipped |
| `apps/web/src/app/SchoolHubApp.tsx` | Edit | Shell UX improvement: sidebar scroll, topbar spacing |
| `apps/web/src/app/ui.tsx` | Edit | ToastHost improvement |
| `apps/web/src/app/confirm.tsx` | Edit | ConfirmDialog spacing |
| `apps/web/src/app/tutorial.tsx` | Tidak diubah | Sudah modern |
| `DataSekolah/generator-tanda-pengenal/src/index.css` | Di-tulis ulang | Diselaraskan dengan design system utama |
| `DataSekolah/generator-tanda-pengenal/src/components/layout/Sidebar.jsx` | Di-tulis ulang | Dark sidebar teal-green |
| `DataSekolah/generator-tanda-pengenal/src/components/layout/Header.jsx` | Di-tulis ulang | Light header hijau-krem |
| `DataSekolah/generator-tanda-pengenal/src/components/layout/Layout.jsx` | Edit | Layout wrapper improvement |

## Konsep Desain Baru

### Palet Warna
- **Primary**: Teal-green (#0D9488 → #2DD4A8) — institusional, Islamic-friendly, fresh
- **Accent**: Emerald gradient — energi positif, pertumbuhan
- **Status**: Hijau solid (hadir), amber/warm (telat/izin), merah solid (alpa)
- **Background**: Forest-slate gelap (dark) / warm-white (light)

### Typography
- **Heading**: Plus Jakarta Sans, 800 weight, tight letter-spacing
- **Body**: Inter fallback, 14px base, 1.58 line-height
- **Mono**: JetBrains Mono untuk data/numerik

### Spacing & Touch Target
- Touch target: min 42px desktop, 44px mobile
- Button radius: 12px (lebih organik)
- Card radius: 16-20px
- Content spacing: clamp-based responsive

### Motion
- Reduced motion default via `prefers-reduced-motion`
- Hover: translateY(-1px) + border accent
- Focus: 3px accent ring

## Risiko
- **OKLCH ke Hex**: Warna OKLCH diganti hex/RGBA untuk kompatibilitas browser lebih luas
- **color-mix ke srgb**: Spesifik color space ditambahkan
- **CSS size reduction**: 6120 baris → 1780 baris, potential CSS yang hilang jika ada class yang tidak terdokumentasi

## Validasi Build
```
npx tsc --noEmit    # PASS
npx vite build       # PASS, 1.43s, CSS ~49KB, JS ~208KB
```
