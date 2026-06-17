package id.sch.man1rokanhulu.absensi.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import id.sch.man1rokanhulu.absensi.data.LocalConfig
import id.sch.man1rokanhulu.absensi.network.SchoolHubApiClient
import id.sch.man1rokanhulu.absensi.ui.components.PrimaryActionButton
import id.sch.man1rokanhulu.absensi.ui.components.SecondaryActionButton
import kotlinx.coroutines.launch

private enum class TestState { IDLE, RUNNING, OK, FAIL }

@Composable
fun SetupScreen(config: LocalConfig, api: SchoolHubApiClient, onDone: () -> Unit) {
    val scope = rememberCoroutineScope()
    var serverUrl by remember { mutableStateOf(config.serverUrl) }
    var activationCode by remember { mutableStateOf("") }
    var deviceName by remember { mutableStateOf(config.deviceName) }
    var locationLabel by remember { mutableStateOf(config.locationLabel) }
    var status by remember { mutableStateOf("Isi data dari admin sekolah, lalu tes sambungan sebelum simpan.") }
    var testState by remember { mutableStateOf(TestState.IDLE) }
    var saving by remember { mutableStateOf(false) }
    var showActivationCode by remember { mutableStateOf(false) }

    val canSave = serverUrl.trim().isNotEmpty() && activationCode.trim().isNotEmpty() && deviceName.trim().isNotEmpty()

    Column(
        Modifier
            .fillMaxSize()
            .padding(20.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text("Aktivasi SIAB2 Reader", style = MaterialTheme.typography.headlineMedium)
        Text(
            "Sistem Informasi Akademik Berkarakter. Cukup sekali: minta admin sekolah membuat kode aktivasi di menu HP Scanner & Kartu, lalu masukkan di sini.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        StepRow(1, "Alamat Server")
        OutlinedTextField(
            value = serverUrl,
            onValueChange = { serverUrl = it; testState = TestState.IDLE },
            label = { Text("Alamat Server") },
            placeholder = { Text("Contoh: https://absensi.man1rokanhulu.cloud") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )

        StepRow(2, "Nama HP Scanner")
        OutlinedTextField(
            value = deviceName,
            onValueChange = { deviceName = it },
            label = { Text("Nama HP Scanner") },
            placeholder = { Text("Contoh: HP Gerbang Utama") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )

        OutlinedTextField(
            value = locationLabel,
            onValueChange = { locationLabel = it },
            label = { Text("Lokasi (opsional)") },
            placeholder = { Text("Contoh: Gerbang depan, Mushola, dll") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )

        StepRow(3, "Kode Aktivasi Rahasia")
        OutlinedTextField(
            value = activationCode,
            onValueChange = { activationCode = it },
            label = { Text("Kode Aktivasi Rahasia") },
            placeholder = { Text("Tempel kode dari admin di sini") },
            visualTransformation = if (showActivationCode) VisualTransformation.None else PasswordVisualTransformation(),
            trailingIcon = {
                TextButton(onClick = { showActivationCode = !showActivationCode }) {
                    Text(if (showActivationCode) "Sembunyi" else "Lihat")
                }
            },
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(Modifier.height(4.dp))

        SecondaryActionButton(
            text = when (testState) {
                TestState.RUNNING -> "Mengetes…"
                TestState.OK -> "Sambungan Server OK"
                TestState.FAIL -> "Coba Lagi Tes Sambungan"
                else -> "Tes Sambungan"
            },
            loading = testState == TestState.RUNNING,
            enabled = serverUrl.isNotBlank() && testState != TestState.RUNNING,
            onClick = {
                scope.launch {
                    testState = TestState.RUNNING
                    val ok = runCatching {
                        if (!api.validateServerUrl(serverUrl)) error("Format alamat server salah.")
                        config.serverUrl = serverUrl
                        api.health()
                    }.getOrDefault(false)
                    testState = if (ok) TestState.OK else TestState.FAIL
                    status = if (ok) "Server bisa dihubungi. Silakan simpan dan mulai scan." else "Server belum bisa dihubungi. Periksa alamat atau internet HP."
                }
            }
        )

        PrimaryActionButton(
            text = if (saving) "Menyimpan & mengaktifkan…" else "Simpan & Mulai Scan",
            loading = saving,
            enabled = canSave,
            onClick = {
                scope.launch {
                    saving = true
                    try {
                        if (!api.validateServerUrl(serverUrl)) error("Alamat server harus dimulai dengan https:// (atau http:// di build debug).")
                        config.serverUrl = serverUrl
                        config.deviceName = deviceName.ifBlank { "HP Scanner" }
                        config.locationLabel = locationLabel
                        val token = activationCode.trim().removePrefix("schoolhub:reader-provision:v1:")
                        val data = api.completeProvision(token, config.installDeviceId, config.deviceName)
                        config.deviceId = data.deviceId
                        config.readerSecret = data.readerSecret
                        config.allowedModesCsv = data.allowedModes.joinToString(",")
                        config.lastScanMode = data.allowedModes.firstOrNull() ?: "CHECK_ONLY"
                        status = "HP berhasil diaktifkan. Siap dipakai scan."
                        onDone()
                    } catch (e: Exception) {
                        status = friendlyMessage(e.message)
                    } finally {
                        saving = false
                    }
                }
            }
        )

        Card(
            Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
        ) {
            Text(
                status,
                Modifier.padding(16.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Bantuan", style = MaterialTheme.typography.titleMedium)
                Text(
                    "• Alamat server contoh: https://absensi.man1rokanhulu.cloud\n" +
                        "• Kode aktivasi adalah teks panjang acak dari admin. Salin dengan teliti.\n" +
                        "• Jika 'Tes Sambungan' gagal, periksa Wi-Fi HP atau hubungi operator IT.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun StepRow(number: Int, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primary),
            contentAlignment = Alignment.Center
        ) {
            Text("$number", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onPrimary, fontWeight = FontWeight.Bold)
        }
        Text(label, style = MaterialTheme.typography.titleMedium)
    }
}

private fun friendlyMessage(raw: String?): String {
    val text = raw?.trim().orEmpty()
    if (text.isBlank()) return "Aktivasi gagal. Coba lagi atau hubungi operator IT."
    return when {
        text.contains("Format", ignoreCase = true) -> text
        text.contains("network", ignoreCase = true) || text.contains("Unable to resolve", ignoreCase = true) -> "Alamat server belum bisa dihubungi. Periksa internet atau alamatnya."
        text.contains("invalid", ignoreCase = true) || text.contains("expired", ignoreCase = true) -> "Kode aktivasi salah atau sudah kadaluarsa. Minta admin membuat kode baru."
        else -> text
    }
}
