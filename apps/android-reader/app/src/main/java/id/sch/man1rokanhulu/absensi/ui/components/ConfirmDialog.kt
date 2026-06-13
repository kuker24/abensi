package id.sch.man1rokanhulu.absensi.ui.components

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

@Composable
fun ConfirmDialog(
    title: String,
    message: String,
    confirmLabel: String = "Lanjutkan",
    cancelLabel: String = "Batal",
    destructive: Boolean = false,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    val accent: Color = if (destructive) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title, style = MaterialTheme.typography.titleLarge) },
        text = { Text(message, style = MaterialTheme.typography.bodyMedium) },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text(confirmLabel, color = accent, style = MaterialTheme.typography.labelLarge)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(cancelLabel, style = MaterialTheme.typography.labelLarge)
            }
        }
    )
}
