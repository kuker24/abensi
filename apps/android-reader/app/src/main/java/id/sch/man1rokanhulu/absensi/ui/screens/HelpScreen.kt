package id.sch.man1rokanhulu.absensi.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import id.sch.man1rokanhulu.absensi.ui.components.PrimaryActionButton

@Composable
fun HelpScreen(onBack: () -> Unit) {
    Column(
        Modifier
            .fillMaxSize()
            .padding(20.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text("Bantuan Singkat", style = MaterialTheme.typography.headlineMedium)
        Text(
            "Panduan singkat untuk operator HP scanner. Jika masih bingung, hubungi Operator IT sekolah.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        HelpSection(
            "Cara memakai",
            listOf(
                "Pilih lokasi scan: Gerbang Masuk, Gerbang Keluar, Mushola, atau Cek Saja.",
                "Tekan Mulai Scan, lalu arahkan QR ke kamera HP.",
                "Tunggu sampai layar berubah hijau (berhasil), merah (ditolak), atau kuning (menunggu internet).",
                "Setelah hijau, siswa berikutnya bisa langsung scan."
            )
        )

        HelpSection(
            "Jika kamera tidak terbuka",
            listOf(
                "Tutup aplikasi sepenuhnya, lalu buka kembali.",
                "Periksa izin kamera di Pengaturan HP > Aplikasi > SIAB2 Reader.",
                "Pastikan kamera tidak sedang dipakai aplikasi lain.",
                "Jika tetap gelap, restart HP dan buka aplikasi lagi."
            )
        )

        HelpSection(
            "Jika server tidak tersambung",
            listOf(
                "Periksa Wi-Fi atau data seluler HP nyala.",
                "Buka Pengaturan aplikasi, tekan 'Tes Sambungan Ulang'.",
                "Scan akan masuk antrean otomatis jika offline. Akan terkirim begitu internet pulih.",
                "Jika alamat server salah, hubungi Operator IT untuk mengaktifkan ulang HP."
            )
        )

        HelpSection(
            "Jika scan gagal atau ditolak",
            listOf(
                "Pastikan QR siswa terbaca jelas. Bersihkan kotor/goresan pada kartu.",
                "Coba lokasi scan lain (misal: Cek Saja) untuk memastikan QR terbaca.",
                "Jika tertulis 'Format QR tidak didukung', QR yang dipakai bukan QR resmi sekolah.",
                "Jika tertulis 'kadaluarsa' atau 'dicabut', minta admin membuat QR baru untuk siswa tersebut."
            )
        )

        HelpSection(
            "Antrean dan internet putus",
            listOf(
                "Scan offline disimpan otomatis sampai 100 antrean.",
                "Lihat jumlah antrean di layar utama dan layar scanner.",
                "Tekan 'Kirim Ulang Antrean' setelah internet pulih.",
                "Jangan reset aktivasi sebelum antrean kosong, supaya data tidak hilang."
            )
        )

        HelpSection(
            "Hubungi Operator IT",
            listOf(
                "Catat pesan kesalahan yang muncul.",
                "Catat lokasi scan dan jam kejadian.",
                "Foto layar jika perlu, lalu kirim ke Operator IT melalui jalur resmi sekolah.",
                "Jangan bagikan kode aktivasi atau kata sandi melalui chat tidak resmi."
            )
        )

        PrimaryActionButton(text = "Kembali", onClick = onBack)
    }
}

@Composable
private fun HelpSection(title: String, points: List<String>) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            points.forEachIndexed { index, point ->
                Text(
                    "${index + 1}. $point",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}
