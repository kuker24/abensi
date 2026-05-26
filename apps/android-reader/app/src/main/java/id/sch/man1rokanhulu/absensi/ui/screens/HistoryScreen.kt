package id.sch.man1rokanhulu.absensi.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import id.sch.man1rokanhulu.absensi.data.ScanHistoryEntry
import id.sch.man1rokanhulu.absensi.data.ScanHistoryStatus
import id.sch.man1rokanhulu.absensi.data.ScanHistoryStore
import id.sch.man1rokanhulu.absensi.ui.components.ConfirmDialog
import id.sch.man1rokanhulu.absensi.ui.components.PrimaryActionButton
import id.sch.man1rokanhulu.absensi.ui.components.modeLabel
import id.sch.man1rokanhulu.absensi.ui.theme.SemanticColors

@Composable
fun HistoryScreen(historyStore: ScanHistoryStore, onBack: () -> Unit) {
    var entries by remember { mutableStateOf(historyStore.list()) }
    var showClearDialog by remember { mutableStateOf(false) }

    Column(
        Modifier
            .fillMaxSize()
            .padding(20.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Riwayat Scan", style = MaterialTheme.typography.headlineMedium)
        Text(
            "Menampilkan ${entries.size} scan terakhir di HP ini. Kode QR penuh tidak ditampilkan demi keamanan.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        if (entries.isEmpty()) {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Belum ada scan", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "Hasil scan akan muncul di sini setelah Anda menggunakan mode scan.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        } else {
            entries.forEach { entry ->
                HistoryRow(entry)
            }
            OutlinedButton(
                onClick = { showClearDialog = true },
                modifier = Modifier.fillMaxWidth()
            ) { Text("Hapus Riwayat") }
        }

        PrimaryActionButton(text = "Kembali", onClick = onBack)
    }

    if (showClearDialog) {
        ConfirmDialog(
            title = "Hapus Riwayat?",
            message = "Riwayat scan di HP ini akan dihapus. Data presensi di server tetap aman dan tidak terhapus.",
            confirmLabel = "Hapus",
            destructive = true,
            onConfirm = {
                showClearDialog = false
                historyStore.clear()
                entries = emptyList()
            },
            onDismiss = { showClearDialog = false }
        )
    }
}

@Composable
private fun HistoryRow(entry: ScanHistoryEntry) {
    val (color, label) = when (entry.status) {
        ScanHistoryStatus.SENT -> SemanticColors.success to "Terkirim"
        ScanHistoryStatus.QUEUED -> SemanticColors.warning to "Menunggu Internet"
        ScanHistoryStatus.REJECTED -> SemanticColors.error to "Ditolak Server"
    }
    Card(Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Box(modifier = Modifier.size(12.dp).clip(CircleShape).background(color))
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    "${modeLabel(entry.mode)} · ${formatRelative(entry.timestamp)}",
                    style = MaterialTheme.typography.titleSmall
                )
                Text(
                    "Kode: ${entry.maskedCode}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                if (entry.message.isNotBlank()) {
                    Text(entry.message, style = MaterialTheme.typography.bodyMedium)
                }
            }
            Text(label, style = MaterialTheme.typography.labelMedium, color = color, fontWeight = FontWeight.Bold)
        }
    }
}
