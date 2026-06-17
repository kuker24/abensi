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
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import id.sch.man1rokanhulu.absensi.BuildConfig
import id.sch.man1rokanhulu.absensi.data.LocalConfig
import id.sch.man1rokanhulu.absensi.data.ScanHistoryEntry
import id.sch.man1rokanhulu.absensi.ui.components.ConnectionStatus
import id.sch.man1rokanhulu.absensi.ui.components.ModeChipRow
import id.sch.man1rokanhulu.absensi.ui.components.PrimaryActionButton
import id.sch.man1rokanhulu.absensi.ui.components.SecondaryActionButton
import id.sch.man1rokanhulu.absensi.ui.components.StatusBar
import id.sch.man1rokanhulu.absensi.ui.components.modeHelp
import id.sch.man1rokanhulu.absensi.ui.components.modeLabel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    config: LocalConfig,
    allowedModes: List<String>,
    currentMode: String,
    connection: ConnectionStatus,
    queueCount: Int,
    lastEntry: ScanHistoryEntry?,
    onMode: (String) -> Unit,
    onStart: () -> Unit,
    onSettings: () -> Unit,
    onHelp: () -> Unit,
    onHistory: () -> Unit,
    onRetryQueue: () -> Unit
) {
    var isRefreshing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
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
        Text("Akademik Berkarakter", style = MaterialTheme.typography.headlineSmall)
        Text(
            config.deviceName,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        StatusBar(connection, queueCount, config.locationLabel.ifBlank { null })

        Card(
            Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
        ) {
            Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    "Lokasi scan: ${modeLabel(currentMode)}",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onPrimaryContainer
                )
                Text(
                    modeHelp(currentMode),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onPrimaryContainer
                )
            }
        }

        PrimaryActionButton(text = "Mulai Scan", onClick = onStart)

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Pilih lokasi scan", style = MaterialTheme.typography.titleMedium)
                ModeChipRow(allowedModes, currentMode, onMode)
            }
        }

        if (queueCount > 0) {
            Card(
                Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)
            ) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "Antrean Kirim",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSecondaryContainer
                    )
                    Text(
                        "$queueCount scan menunggu dikirim ke server. Pastikan internet HP nyala, lalu coba kirim ulang.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSecondaryContainer
                    )
                    SecondaryActionButton(text = "Kirim Ulang Antrean", onClick = onRetryQueue)
                }
            }
        }

        if (lastEntry != null) {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Scan terakhir", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "${modeLabel(lastEntry.mode)} · ${formatRelative(lastEntry.timestamp)}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        lastEntry.message.ifBlank { statusText(lastEntry.status) },
                        style = MaterialTheme.typography.bodyMedium
                    )
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

internal fun statusText(status: id.sch.man1rokanhulu.absensi.data.ScanHistoryStatus): String = when (status) {
    id.sch.man1rokanhulu.absensi.data.ScanHistoryStatus.SENT -> "Terkirim ke server"
    id.sch.man1rokanhulu.absensi.data.ScanHistoryStatus.QUEUED -> "Menunggu Internet"
    id.sch.man1rokanhulu.absensi.data.ScanHistoryStatus.REJECTED -> "Ditolak Server"
}
