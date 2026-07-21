package id.sch.man1rokanhulu.absensi.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

fun modeLabel(mode: String): String = when (mode) {
    "GERBANG" -> "Gerbang"
    "GATE_IN" -> "Datang"
    "GATE_OUT" -> "Pulang"
    "MUSHOLA" -> "Mushola"
    "CHECK_ONLY" -> "Cek Identitas"
    else -> mode.replace('_', ' ')
}

fun modeHelp(mode: String): String = when (mode) {
    "GERBANG" -> "Untuk datang/pulang siswa, guru, staf, dan kepala."
    "GATE_IN" -> "Catat kedatangan siswa, guru, staf, dan kepala."
    "GATE_OUT" -> "Catat kepulangan siswa, guru, staf, dan kepala."
    "MUSHOLA" -> "Untuk sholat/ibadah siswa."
    "CHECK_ONLY" -> "Baca identitas online tanpa mencatat presensi."
    else -> "Mode scan aktif."
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ModeChipRow(
    allowedModes: List<String>,
    currentMode: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val list = allowedModes.ifEmpty { listOf("CHECK_ONLY") }
    FlowRow(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        list.forEach { mode ->
            FilterChip(
                selected = mode == currentMode,
                onClick = { onSelect(mode) },
                label = { Text(modeLabel(mode), style = MaterialTheme.typography.labelLarge) },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = MaterialTheme.colorScheme.primary,
                    selectedLabelColor = MaterialTheme.colorScheme.onPrimary
                )
            )
        }
    }
}
