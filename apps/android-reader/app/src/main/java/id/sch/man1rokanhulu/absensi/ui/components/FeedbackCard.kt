package id.sch.man1rokanhulu.absensi.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import id.sch.man1rokanhulu.absensi.ui.theme.SemanticColors

enum class FeedbackTone { IDLE, PROCESSING, SUCCESS, ERROR, PENDING }

data class FeedbackData(
    val title: String,
    val message: String,
    val tone: FeedbackTone
)

private fun toneColor(tone: FeedbackTone): Color = when (tone) {
    FeedbackTone.SUCCESS -> SemanticColors.success
    FeedbackTone.ERROR -> SemanticColors.error
    FeedbackTone.PENDING -> SemanticColors.warning
    FeedbackTone.PROCESSING -> SemanticColors.info
    FeedbackTone.IDLE -> SemanticColors.neutral
}

@Composable
fun FeedbackCard(data: FeedbackData, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier.fillMaxWidth().semantics {
            contentDescription = "${data.title}. ${data.message}"
        },
        colors = CardDefaults.cardColors(containerColor = toneColor(data.tone))
    ) {
        Column(
            Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Text(
                data.title,
                color = Color.White,
                style = MaterialTheme.typography.headlineSmall
            )
            Text(
                data.message,
                color = Color.White,
                style = MaterialTheme.typography.bodyLarge
            )
        }
    }
}
