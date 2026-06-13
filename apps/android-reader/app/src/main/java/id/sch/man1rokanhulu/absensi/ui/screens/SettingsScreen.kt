package id.sch.man1rokanhulu.absensi.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import id.sch.man1rokanhulu.absensi.BuildConfig
import id.sch.man1rokanhulu.absensi.data.LocalConfig
import id.sch.man1rokanhulu.absensi.network.SchoolHubApiClient
import id.sch.man1rokanhulu.absensi.ui.components.ConfirmDialog
import id.sch.man1rokanhulu.absensi.ui.components.PrimaryActionButton
import id.sch.man1rokanhulu.absensi.ui.components.SecondaryActionButton
import id.sch.man1rokanhulu.absensi.ui.components.modeLabel
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen(
    config: LocalConfig,
    api: SchoolHubApiClient,
    queueCount: Int,
    onClearQueue: () -> Unit,
    onRetryQueue: () -> Unit,
    onBack: () -> Unit,
    onReprovision: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var autoOpen by remember { mutableStateOf(config.autoOpenScanner) }
    var keepOn by remember { mutableStateOf(config.keepScreenOn) }
    var soundOn by remember { mutableStateOf(config.soundEnabled) }
    var vibrationOn by remember { mutableStateOf(config.vibrationEnabled) }
    var status by remember { mutableStateOf("Pengaturan untuk operator HP scanner.") }
    var showResetDialog by remember { mutableStateOf(false) }
    var showClearQueueDialog by remember { mutableStateOf(false) }
    var testing by remember { mutableStateOf(false) }

    Column(
        Modifier
            .fillMaxSize()
            .padding(20.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text("Pengaturan", style = MaterialTheme.typography.headlineMedium)

        // Info Section
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Info HP Scanner", style = MaterialTheme.typography.titleMedium)
                InfoRow("Nama HP", config.deviceName)
                if (config.locationLabel.isNotBlank()) InfoRow("Lokasi", config.locationLabel)
                InfoRow("Lokasi yang boleh dipakai", config.allowedModes().joinToString { modeLabel(it) }.ifBlank { "—" })
                InfoRow("Versi aplikasi", BuildConfig.VERSION_NAME)
            }
        }

        // Behavior toggles
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Perilaku Aplikasi", style = MaterialTheme.typography.titleMedium)
                ToggleRow("Langsung buka scanner", "HP yang dipasang permanen di gerbang/mushola.", autoOpen) {
                    autoOpen = it; config.autoOpenScanner = it
                }
                ToggleRow("Layar tetap menyala", "Hindari layar mati saat scan terus-menerus.", keepOn) {
                    keepOn = it; config.keepScreenOn = it
                }
                ToggleRow("Bunyi feedback", "Bunyi setiap scan berhasil/ditolak/menunggu.", soundOn) {
                    soundOn = it; config.soundEnabled = it
                }
                ToggleRow("Getaran feedback", "Getar pada hasil scan.", vibrationOn) {
                    vibrationOn = it; config.vibrationEnabled = it
                }
            }
        }

        // Connection section
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Sambungan Server", style = MaterialTheme.typography.titleMedium)
                Text(
                    "Alamat: ${config.serverUrl}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                SecondaryActionButton(
                    text = if (testing) "Mengetes…" else "Tes Sambungan Ulang",
                    loading = testing,
                    onClick = {
                        scope.launch {
                            testing = true
                            val ok = runCatching { api.health() }.getOrDefault(false)
                            testing = false
                            status = if (ok) "Server bisa dihubungi." else "Server belum bisa dihubungi. Periksa internet atau hubungi operator IT."
                        }
                    }
                )
            }
        }

        // Queue management
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Antrean Kirim", style = MaterialTheme.typography.titleMedium)
                Text(
                    if (queueCount > 0)
                        "$queueCount scan menunggu dikirim ke server."
                    else
                        "Tidak ada antrean. Semua scan sudah terkirim.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                if (queueCount > 0) {
                    SecondaryActionButton(text = "Kirim Ulang Sekarang", onClick = onRetryQueue)
                    OutlinedButton(
                        onClick = { showClearQueueDialog = true },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("Kosongkan Antrean") }
                }
            }
        }

        // Danger zone
        Card(
            Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)
        ) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "Hapus Aktivasi HP",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onErrorContainer
                )
                Text(
                    "Reset akan menghapus aktivasi HP ini. Setelah reset, HP perlu diaktifkan ulang dengan kode baru dari admin.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onErrorContainer
                )
                OutlinedButton(
                    onClick = { showResetDialog = true },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Reset Aktivasi HP") }
            }
        }

        Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
            Text(status, Modifier.padding(16.dp), style = MaterialTheme.typography.bodyMedium)
        }

        PrimaryActionButton(text = "Kembali", onClick = onBack)
    }

    if (showResetDialog) {
        ConfirmDialog(
            title = "Reset HP Scanner?",
            message = "Reset akan menghapus aktivasi HP ini. Data rahasia di HP akan dihapus dan tidak bisa dipulihkan. HP perlu diaktifkan ulang oleh admin.",
            confirmLabel = "Hapus & Reset",
            destructive = true,
            onConfirm = {
                showResetDialog = false
                onReprovision()
            },
            onDismiss = { showResetDialog = false }
        )
    }

    if (showClearQueueDialog) {
        ConfirmDialog(
            title = "Kosongkan Antrean?",
            message = "Antrean berisi $queueCount scan yang belum dikirim ke server. Jika dikosongkan, scan tersebut tidak akan dicatat sebagai hadir.",
            confirmLabel = "Kosongkan",
            destructive = true,
            onConfirm = {
                showClearQueueDialog = false
                onClearQueue()
                status = "Antrean berhasil dikosongkan."
            },
            onDismiss = { showClearQueueDialog = false }
        )
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
        Text(
            "$label: ",
            modifier = Modifier.padding(end = 4.dp),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(value, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun ToggleRow(title: String, subtitle: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(checked = checked, onCheckedChange = onChange)
    }
}
