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
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import id.sch.man1rokanhulu.absensi.BuildConfig
import id.sch.man1rokanhulu.absensi.data.LocalConfig
import id.sch.man1rokanhulu.absensi.data.ScanHistoryEntry
import id.sch.man1rokanhulu.absensi.data.ScanHistoryStatus
import id.sch.man1rokanhulu.absensi.ui.readerDeviceTitle
import id.sch.man1rokanhulu.absensi.ui.readerModeSummary
import id.sch.man1rokanhulu.absensi.ui.showManualModePicker
import id.sch.man1rokanhulu.absensi.ui.components.ConnectionStatus
import id.sch.man1rokanhulu.absensi.ui.components.ModeChipRow
import id.sch.man1rokanhulu.absensi.ui.components.PrimaryActionButton
import id.sch.man1rokanhulu.absensi.ui.components.SecondaryActionButton
import id.sch.man1rokanhulu.absensi.ui.components.StatusBar
import id.sch.man1rokanhulu.absensi.ui.components.modeLabel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    config: LocalConfig,
    allowedModes: List<String>,
    currentMode: String,
    connection: ConnectionStatus,
    queueCount: Int,
    recentEntries: List<ScanHistoryEntry>,
    onMode: (String) -> Unit,
    onStart: () -> Unit,
    onSettings: () -> Unit,
    onHelp: () -> Unit,
    onHistory: () -> Unit,
    onRetryQueue: () -> Unit
) {
    var isRefreshing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val deviceTitle = readerDeviceTitle(allowedModes)
    val modeSummary = readerModeSummary(allowedModes)
    val lastEntry = recentEntries.firstOrNull()

    PullToRefreshBox(
        isRefreshing = isRefreshing,
        onRefresh = {
            isRefreshing = true
            onRetryQueue()
            scope.launch {
                delay(1500)
                isRefreshing = false
            }
        }
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .padding(20.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Text("SIAB2 Reader", style = MaterialTheme.typography.headlineMedium)
            Text(deviceTitle, style = MaterialTheme.typography.headlineSmall)
            Text(
                config.deviceName.ifBlank { "HP Scanner" },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            StatusBar(connection, queueCount, config.locationLabel.ifBlank { deviceTitle })

            Card(
                Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
            ) {
                Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(modeSummary, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onPrimaryContainer)
                    Text("Siap Scan", style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.onPrimaryContainer)
                    Text(
                        when (deviceTitle) {
                            "HP Gerbang" -> "Untuk kepala, guru, staf, dan siswa datang/pulang. Scan pertama tercatat Datang, scan berikutnya setelah jeda aman tercatat Pulang."
                            "HP Mushola" -> "Untuk scan sholat/ibadah siswa. Duplikat hari yang sama akan diberi pesan sudah tercatat."
                            else -> "Arahkan QR ke kamera untuk cek ke server."
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                }
            }

            PrimaryActionButton(text = "SCAN SEKARANG", onClick = onStart)

            if (showManualModePicker(allowedModes)) {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("Mode lanjutan", style = MaterialTheme.typography.titleMedium)
                        ModeChipRow(allowedModes, currentMode, onMode)
                    }
                }
            }

            if (queueCount > 0) {
                Card(
                    Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)
                ) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Antrean Kirim", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSecondaryContainer)
                        Text("$queueCount scan menunggu internet. Periksa Wi-Fi, lalu kirim ulang.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSecondaryContainer)
                        SecondaryActionButton(text = "Kirim Ulang Antrean", onClick = onRetryQueue)
                    }
                }
            }

            if (lastEntry != null) {
                LastScanCard(lastEntry)
            }

            if (recentEntries.size > 1) {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("5 scan terakhir", style = MaterialTheme.typography.titleMedium)
                        recentEntries.drop(1).take(4).forEach { entry -> LastScanMiniRow(entry) }
                    }
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                OutlinedButton(onClick = onHistory, modifier = Modifier.weight(1f)) { Text("Riwayat") }
                OutlinedButton(onClick = onHelp, modifier = Modifier.weight(1f)) { Text("Bantuan") }
                OutlinedButton(onClick = onSettings, modifier = Modifier.weight(1f)) { Text("Pengaturan") }
            }

            Text(
                "Versi aplikasi ${BuildConfig.VERSION_NAME}",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun LastScanCard(entry: ScanHistoryEntry) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Scan terakhir", style = MaterialTheme.typography.titleMedium)
            Text(entry.displayName ?: entry.maskedCode, style = MaterialTheme.typography.headlineSmall)
            Text(
                listOfNotNull(entry.displayMeta, entry.actionLabel ?: modeLabel(entry.mode), formatRelative(entry.timestamp)).joinToString(" · "),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(entry.message.ifBlank { statusText(entry.status) }, style = MaterialTheme.typography.bodyLarge)
        }
    }
}

@Composable
private fun LastScanMiniRow(entry: ScanHistoryEntry) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(entry.displayName ?: entry.maskedCode, style = MaterialTheme.typography.titleSmall)
        Text(
            listOfNotNull(entry.actionLabel ?: modeLabel(entry.mode), formatRelative(entry.timestamp), entry.message.ifBlank { statusText(entry.status) }).joinToString(" · "),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

internal fun formatRelative(ts: Long): String {
    val diff = System.currentTimeMillis() - ts
    val seconds = diff / 1000
    val minutes = seconds / 60
    val hours = minutes / 60
    return when {
        seconds < 5 -> "baru saja"
        seconds < 60 -> "${seconds} detik lalu"
        minutes < 60 -> "${minutes} menit lalu"
        hours < 24 -> "${hours} jam lalu"
        else -> {
            val date = java.text.SimpleDateFormat("dd MMM HH:mm", java.util.Locale("id", "ID"))
            date.format(java.util.Date(ts))
        }
    }
}

internal fun statusText(status: ScanHistoryStatus): String = when (status) {
    ScanHistoryStatus.SENT -> "Terkirim ke server"
    ScanHistoryStatus.QUEUED -> "Menunggu Internet"
    ScanHistoryStatus.REJECTED -> "Ditolak Server"
}
