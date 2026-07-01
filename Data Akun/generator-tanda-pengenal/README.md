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

Kolom minimal yang harus tersedia:

- `nama`
- `tempat_lahir`
- `tanggal_lahir`
- `nisn`
- `alamat`

Untuk tempat tanggal lahir, aplikasi juga mendukung satu kolom gabungan dengan alias:

- `ttl`
- `tempat_tanggal_lahir`
- `Tempat Tanggal Lahir`

Contoh nilai TTL yang didukung:

- `Pekanbaru, 12 Agustus 2010`
- `Pekanbaru 12 Agustus 2010`

## QR

- Jika kolom `qr_value` tersedia, nilai itu dipakai sebagai isi QR.
- Jika `qr_value` kosong/tidak ada, QR otomatis fallback ke `nisn`.

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

## Catatan Keamanan Data

- Aplikasi ini standalone frontend dan tidak memiliki backend.
- Tidak ada database server.
- Data import tersimpan di browser local storage.
- Jangan gunakan perangkat publik/bersama untuk memproses data pribadi siswa.
- Bersihkan data browser setelah selesai jika memakai perangkat non-pribadi.

## Known Limitations

- Belum ada automated test framework khusus untuk generator ini.
- Vite build dapat memberi warning large chunks karena dependency PDF/export.
- Dependency audit lokal masih perlu follow-up jika alat ini akan dipakai luas dan rutin.
