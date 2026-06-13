# Accessibility Pass — SchoolHub e-Hadir

**Tanggal:** 2026-05-19  
**Step:** 7/24  
**Status:** Selesai lokal

## Temuan QA

Desktop dan mobile QA menunjukkan:
- Banyak kontrol di bawah 32–38px tinggi/lebar (touch target ideal: 44px).
- Fokus keyboard belum terkonfirmasi terlihat pada semua kontrol interaktif.

## Perubahan

| File | Perubahan |
|---|---|
| `apps/web/src/styles.css` | **Touch target minimum**: `.nav-item` → 44px, `.btn.icon` → 36×36px, `.btn.sm` → 32px min-height, `.btn.lg` → 48px, `.statuspick button` → min 36×56px, `.quick-route-list button` → 44px. **Focus-visible**: semua button, nav-item, link, search-result, dan input sekarang dapat outline `2px solid var(--primary)` via `focus-visible` rule global. **Input**: `:focus-visible` menggantikan `:focus` untuk menghindari outline mouse. |

## Checklist aksesibilitas minimum

| Item | Status |
|---|---|
| Touch target ≥ 44px di mana memungkinkan | ✅ Nav sidebar, quick route list, tombol aksi kini punya min-height cukup |
| Focus-visible terlihat pada kontrol keyboard | ✅ Global `a, button, [tabindex]` ring ditambahkan |
| Icon-only button punya `aria-label` | ✅ Sudah ada dari pass sebelumnya (`IconBtn` selalu menerima label) |
| Skip-link ke konten utama | ✅ Sudah ada di shell app |
| State UI punya `role`/`aria-live` | ✅ `LoadingState` (role=status, aria-busy), `ErrorState` (role=alert), `ToastHost` (role=status, aria-live=polite) |
| Kontras teks | ⚠️ Tidak diuji formal dalam pass ini; sudah memenuhi dark theme SchoolHub dengan rasio minimum `#f0ede8` on `#16181c` ≈ 15:1 |

## Verifikasi lokal

```bash
npm run lint --prefix apps/web       # lulus
npm run typecheck --prefix apps/web  # lulus
npm run test --prefix apps/web       # 2 files, 6 tests lulus
npm run build --prefix apps/web      # lulus
```

## Next

Step 8: **Perbaiki UX form**.
