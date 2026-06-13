# Loading / Empty / Error State Standardization

**Tanggal:** 2026-05-19  
**Step:** 6/24  
**Status:** Selesai lokal

## Perubahan

| File | Perubahan |
|---|---|
| `apps/web/src/app/ui.tsx` | Standarisasi `LoadingState`, `ErrorState`, `EmptyState`, dan `FriendlyEmptyState` dengan struktur visual konsisten, `role=status`/`role=alert`, icon container, action slot, dan pesan error ramah. |
| `apps/web/src/styles.css` | Menambahkan styling `.app-state`, `.app-state-icon`, `.state-detail`, `.app-state-action`, dan memperbaiki visual empty/error agar konsisten dark-only. |

## Pola final

- **Loading:** judul + subteks tindakan, `aria-busy`, `role=status`.
- **Empty:** icon + judul + subteks + optional action.
- **Error:** judul ramah + instruksi tindak lanjut + detail teknis kecil + optional retry.
- Error umum yang dipetakan:
  - `403/Forbidden` → `Akses data ditolak`.
  - `401/Unauthorized/session` → `Sesi perlu diperiksa`.
  - network/timeout → `Koneksi belum stabil`.
  - lainnya → `Data belum bisa dimuat`.

## Dampak langsung

- Halaman `/guru/rekap` yang saat ini masih menerima HTTP 403 tidak lagi menampilkan hanya `Forbidden resource`; user mendapat konteks bahwa akses data ditolak dan harus menghubungi Admin/TU/Operator IT jika seharusnya boleh.
- Semua halaman yang memakai komponen state bersama otomatis mendapatkan visual state yang sama.

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

## Next

Step 7 accessibility pass harus melanjutkan dengan fokus:

- Touch target minimum.
- Focus-visible pada semua kontrol.
- Icon-only button label.
- Dialog/confirm semantics.
