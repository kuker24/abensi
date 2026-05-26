# CSP/Font Cleanup — SchoolHub e-Hadir

**Tanggal:** 2026-05-19  
**Step:** 5/24  
**Status:** Selesai lokal; siap diverifikasi lagi setelah deploy aman.

## Masalah dari QA

Desktop dan mobile QA menemukan error berulang di console production:

1. Inline script ditolak CSP: `script-src 'self'`.
2. Google Fonts stylesheet ditolak CSP: `style-src 'self' 'unsafe-inline'`.

## Perubahan

| File | Perubahan |
|---|---|
| `apps/web/index.html` | Menghapus inline script yang hanya set `data-theme='dark'`. HTML sudah statis memakai `<html lang="id" data-theme="dark">`, sehingga script tidak diperlukan. |
| `apps/web/src/styles.css` | Menghapus `@import` Google Fonts eksternal dan mengganti font token ke CSP-safe system stacks. |

## Keputusan desain

- Tetap **dark-only**.
- Tidak menambah domain eksternal ke CSP production.
- Tidak menambah inline nonce/hash karena lebih aman dan sederhana menghapus kebutuhan inline script.
- Font visual memakai system stack agar tidak ada request eksternal dan tetap cepat saat cold load.

## Verifikasi lokal

Command yang sudah lulus:

```bash
npm run lint --prefix apps/web
npm run typecheck --prefix apps/web
npm run test --prefix apps/web
npm run build --prefix apps/web
```

Hasil:

- ESLint: lulus.
- TypeScript: lulus.
- Vitest: 2 files, 6 tests lulus.
- Vite build: lulus.
- `rg` pada `apps/web/dist`, `apps/web/index.html`, dan `apps/web/src/styles.css` tidak menemukan sisa `fonts.googleapis`, inline theme script, `Playfair`, `Inter`, atau `JetBrains` import.

## Catatan deploy

Perubahan baru efektif di production setelah step 21 deploy aman dengan full replacement static assets.
