# Form UX Improvement — SchoolHub e-Hadir

**Tanggal:** 2026-05-19  
**Step:** 8/24  
**Status:** Selesai lokal

## Perubahan

| File | Perubahan |
|---|---|
| `apps/web/src/app/pages/guru/GuruPages.jsx` | `CorrectionPage`: menambah state `saving`, try/catch error handling, `loading` prop pada tombol submit, `disabled` mencakup `saving`. `TeacherLeavePage`: menambah state `saving`, try/catch error handling, `loading` dan `disabled` pada tombol submit. |

## Pola form yang sudah aman

Pola yang sudah bagus (dari pass sebelumnya):
- **Reset form setelah submit**: `CorrectionPage`, `TeacherLeavePage`, form sesi jadwal.
- **Validasi panjang teks**: alasan koreksi/pengajuan minimal 10 karakter dengan hint `n/10+`.
- **Disabled state saat invalid**: tombol tidak aktif jika syarat belum terpenuhi.
- **Confirm destruktif**: `riskConfirm` digunakan untuk nonaktifkan akun, hapus, cabut QR, bersihkan data, ganti kunci, dll.

## Form yang ditingkatkan di pass ini

| Form | Sebelum | Sesudah |
|---|---|---|
| Koreksi Presensi Guru | Submit langsung tanpa loading/try-catch | Ada `saving` state, `loading` spinner, error handling dengan `notify('bad')` |
| Izin/Sakit/Dinas Guru | Submit langsung tanpa loading/try-catch | Ada `saving` state, `loading` spinner, error handling |

## Dampak

- Guru tidak bisa double-submit koreksi atau izin karena tombol disabled + loading.
- Error API ditampilkan sebagai notifikasi, bukan crash page.

## Verifikasi lokal

```bash
npm run lint --prefix apps/web       # lulus
npm run typecheck --prefix apps/web  # lulus
npm run test --prefix apps/web       # 2 files, 6 tests lulus
npm run build --prefix apps/web      # lulus
```

## Next step: 9 — Perbaiki UX tabel lanjutan

Fokus: tabel pada laporan, riwayat, dan master data agar responsive dan konsisten di mobile.
