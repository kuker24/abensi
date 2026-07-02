# Generator Tanda Pengenal SIAB2

Generator Tanda Pengenal SIAB2 adalah aplikasi frontend standalone untuk membuat kartu identitas resmi siswa MAN 1 Rokan Hulu. Alur utamanya adalah import CSV data siswa, preview kartu portrait resmi, lalu export PDF A4 print-ready.

## Tujuan

- Import CSV data siswa secara cepat.
- Preview kartu tanda pengenal portrait resmi yang selaras dengan visual SIAB2.
- Export PDF A4 print-ready untuk kebutuhan operasional sekolah.

## Stack

- React + Vite
- Zustand
- Tailwind CSS
- PapaParse
- html2canvas + jsPDF
- qrcode.react

## Field Wajib CSV

Kolom minimal yang harus tersedia untuk kartu siswa final:

- `nama`
- `nisn`
- `qr_value` resmi `schoolhub:qr:v1:QR_...` jika akan dicetak produksi

Kolom `ttl`, `tempat_lahir`, `tanggal_lahir`, dan `alamat` masih boleh diimport sebagai metadata lokal, tetapi tidak dicetak pada kartu siswa final.

## Privacy & Data Handling

- Aplikasi ini standalone frontend dan tidak memiliki backend.
- Generator tidak mengirim data siswa ke server selama dipakai sebagai standalone tool.
- Data import tersimpan sementara di browser `localStorage` perangkat operator dengan key `id-card-generator-storage`.
- Data yang dipersist hanya field yang diizinkan untuk kebutuhan kartu; raw row CSV dan kolom sensitif tidak disimpan.
- Jangan gunakan perangkat publik/bersama untuk memproses data pribadi siswa.
- Gunakan tombol **Hapus Data Lokal** setelah selesai mencetak atau sebelum menyerahkan perangkat ke orang lain.
- Jika disajikan di route production `/id-card-generator/`, route static ini masih bersifat public. Gunakan hanya sebagai operator-only SOP pada perangkat tepercaya sampai auth guard, IP allowlist, atau VPN diterapkan.

## CSV Safety Rules

Kolom yang diterima untuk data kartu:

- `id`
- `nama`
- `tempat_lahir`
- `tanggal_lahir`
- `ttl`
- `nisn`
- `alamat`
- `kelas`
- `jurusan`
- `role`
- `status`
- `qr_value`
- `tahun_ajaran`
- `nomor_kartu`
- `createdAt`
- `updatedAt`

Aturan keamanan CSV:

- Jangan import CSV berisi `password`, `pass`, `pwd`, `username`, `token`, `secret`, `api_key`, `access_token`, `refresh_token`, `cookie`, `session`, `credential`, `auth`, `key`, `raw`, atau kolom rahasia lain.
- Jika CSV berisi kolom sensitif, aplikasi mengabaikan kolom tersebut dan hanya menampilkan nama kolomnya sebagai warning.
- Jika CSV berisi kolom tidak dikenal, kolom tersebut juga diabaikan.
- Warning tidak menampilkan nilai dari password/token/secret.

## Local Storage Policy

- localStorage hanya untuk penggunaan sementara saat operator membuat kartu.
- Jangan anggap localStorage sebagai database, backup, atau arsip resmi.
- Setelah PDF selesai dibuat dan diverifikasi, klik **Hapus Data Lokal**.
- Jika menggunakan perangkat non-pribadi, bersihkan data browser juga dari menu browser setelah selesai.
- Jika data lama pernah tersimpan sebelum hardening ini, aplikasi akan melakukan sanitasi saat load dan membuang field lama seperti `raw`, `username`, `password`, `token`, dan `secret`.

## QR Safety

- Jika kolom `qr_value` tersedia dan aman, nilai itu dipakai sebagai isi QR.
- Jika `qr_value` kosong/tidak ada, QR otomatis fallback ke `nisn`.
- QR tidak boleh berisi password, token, secret, cookie, session, API key, atau kredensial lain.
- Jika `qr_value` terlihat mengandung pola sensitif, aplikasi mengabaikannya dan fallback ke `nisn` tanpa menampilkan nilai sensitif di UI.

## Operator SOP

1. Pakai laptop/perangkat operator yang tepercaya.
2. Siapkan CSV resmi yang hanya berisi kolom kartu yang diperlukan.
3. Pastikan CSV tidak memuat password, token, secret, cookie, session, atau kredensial lain.
4. Import CSV dan cek warning kolom yang diabaikan.
5. Preview kartu dan pastikan nama, NISN, label SISWA, dan QR benar.
6. Export PDF dan cek hasil A4 portrait 3x3 sebelum dicetak massal.
7. Setelah selesai, klik **Hapus Data Lokal**.
8. Jika route `/id-card-generator/` masih public, gunakan hanya dari perangkat operator tepercaya sampai auth guard/IP allowlist/VPN diterapkan.
9. Jangan membagikan PDF mentah ke kanal publik.

## Menjalankan Project

```bash
npm install
npm run dev
npm run lint
npm run build
npm run preview
```

## Contoh CSV

```csv
nama,tempat_lahir,tanggal_lahir,nisn,alamat,kelas,qr_value
Ahmad Fauzan,Rokan Hulu,2010-02-14,1234567890,"Jl. Tuanku Tambusai, Pasir Pengaraian",X A,
Siti Rahma,Pekanbaru,12/08/2010,0987654321,"Desa Rambah Tengah Hulu",X B,https://verifikasi.example/siswa/0987654321
Budi Santoso,"",,"1122334455","Dusun Suka Maju",X C,1122334455
```

Alternatif dengan kolom TTL gabungan:

```csv
nama,Tempat Tanggal Lahir,nisn,alamat
Nur Aisyah,"Pekanbaru, 12 Agustus 2010",1231231231,"Jl. Diponegoro, Rokan Hulu"
Rafi Maulana,"Pekanbaru 12 Agustus 2010",3213213213,"Desa Rambah Hilir"
```

## Export PDF

- Ukuran kartu default: CR80 portrait `53.98mm x 85.60mm`.
- PDF output: A4 portrait.
- Layout: 3x3 kartu per halaman.
- Cut marks bersifat opsional dan bisa diaktifkan/nonaktifkan dari halaman export/generate.

## Known Limitations

- Route static `/id-card-generator/` belum menjadi server-side protected route; endpoint API resmi tetap membutuhkan sesi SIAB2.
- Vite build dapat memberi warning large chunks karena dependency PDF/export.
- Dependency audit lokal masih perlu follow-up jika alat ini akan dipakai luas dan rutin.
