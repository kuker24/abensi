package id.sch.man1rokanhulu.absensi.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import id.sch.man1rokanhulu.absensi.BuildConfig
import id.sch.man1rokanhulu.absensi.network.SchoolHubApiClient
import id.sch.man1rokanhulu.absensi.ui.components.PrimaryActionButton
import id.sch.man1rokanhulu.absensi.ui.components.SecondaryActionButton

@Composable
fun ForcedUpdateScreen(
    info: SchoolHubApiClient.VersionInfo,
    busy: Boolean,
    message: String?,
    onInstall: () -> Unit,
    onSettings: () -> Unit,
    onHelp: () -> Unit
) {
    Column(
        Modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.Center
    ) {
        Card(
            Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)
        ) {
            Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Update APK Wajib", style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.onErrorContainer)
                Text(
                    "Versi sekarang ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE}) harus diperbarui ke ${info.latestVersionName} (${info.latestVersionCode}) sebelum scan dilanjutkan.",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onErrorContainer
                )
                Text(
                    "Antrean offline, aktivasi HP, dan secret reader tidak dihapus oleh proses update.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onErrorContainer
                )
                Text(
                    "Tekan Download / Install, lalu konfirmasi pemasangan di installer Android. Jika diminta, aktifkan izin install dari sumber tidak dikenal.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onErrorContainer
                )
                if (!info.releaseNotes.isNullOrBlank()) Text(info.releaseNotes, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onErrorContainer)
                if (!message.isNullOrBlank()) Text(message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onErrorContainer)
                PrimaryActionButton(text = if (busy) "Menyiapkan update…" else "Download / Install", loading = busy, onClick = onInstall)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    SecondaryActionButton(text = "Pengaturan", onClick = onSettings, modifier = Modifier.weight(1f))
                    SecondaryActionButton(text = "Bantuan", onClick = onHelp, modifier = Modifier.weight(1f))
                }
            }
        }
    }
}
