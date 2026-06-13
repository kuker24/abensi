package id.sch.man1rokanhulu.absensi.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import id.sch.man1rokanhulu.absensi.ui.theme.SemanticColors

enum class ConnectionStatus { CHECKING, ONLINE, SLOW, OFFLINE }

@Composable
fun ConnectionLamp(status: ConnectionStatus, modifier: Modifier = Modifier) {
    val color = when (status) {
        ConnectionStatus.ONLINE -> SemanticColors.success
        ConnectionStatus.SLOW -> SemanticColors.warning
        ConnectionStatus.OFFLINE -> SemanticColors.error
        ConnectionStatus.CHECKING -> SemanticColors.neutral
    }
    val label = when (status) {
        ConnectionStatus.ONLINE -> "Koneksi online"
        ConnectionStatus.SLOW -> "Koneksi lambat"
        ConnectionStatus.OFFLINE -> "Koneksi offline"
        ConnectionStatus.CHECKING -> "Memeriksa koneksi"
    }
    Box(modifier = modifier.size(10.dp).clip(CircleShape).background(color)
        .semantics { contentDescription = label })
}

@Composable
fun StatusBar(
    connection: ConnectionStatus,
    queueCount: Int,
    locationLabel: String?,
    modifier: Modifier = Modifier,
    compact: Boolean = false
) {
    val connectionLabel = when (connection) {
        ConnectionStatus.ONLINE -> "Online"
        ConnectionStatus.SLOW -> "Online (lambat)"
        ConnectionStatus.OFFLINE -> "Offline"
        ConnectionStatus.CHECKING -> "Memeriksa…"
    }
    val bg = if (compact) Color.Black.copy(alpha = 0.55f) else MaterialTheme.colorScheme.surfaceVariant
    val fg = if (compact) Color.White else MaterialTheme.colorScheme.onSurfaceVariant

    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(bg)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        ConnectionLamp(connection)
        Text(
            connectionLabel,
            style = MaterialTheme.typography.labelLarge,
            color = fg
        )
        if (!locationLabel.isNullOrBlank()) {
            Dot(fg)
            Text(locationLabel, style = MaterialTheme.typography.labelLarge, color = fg)
        }
        if (queueCount > 0) {
            Dot(fg)
            Text(
                "Antrean $queueCount",
                style = MaterialTheme.typography.labelLarge,
                color = if (compact) SemanticColors.warning else SemanticColors.warning
            )
        }
    }
}

@Composable
private fun Dot(color: Color) {
    Box(modifier = Modifier.size(4.dp).clip(CircleShape).background(color.copy(alpha = 0.45f)))
}
