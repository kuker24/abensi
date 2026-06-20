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
import androidx.compose.ui.unit.dp
import id.sch.man1rokanhulu.absensi.data.LocalConfig
import id.sch.man1rokanhulu.absensi.network.SchoolHubApiClient
import id.sch.man1rokanhulu.absensi.ui.components.PrimaryActionButton
import id.sch.man1rokanhulu.absensi.ui.components.SecondaryActionButton
import id.sch.man1rokanhulu.absensi.ui.friendlyActivationMessage
import id.sch.man1rokanhulu.absensi.ui.readerDeviceTitle
import id.sch.man1rokanhulu.absensi.ui.readerModeSummary
import kotlinx.coroutines.launch

private enum class TestState { IDLE, RUNNING, OK, FAIL }

@Composable
fun SetupScreen(config: LocalConfig, api: SchoolHubApiClient, onDone: () -> Unit) {
    val scope = rememberCoroutineScope()
    var serverUrl by remember { mutableStateOf(config.serverUrl.ifBlank { "https://absensi.man1rokanhulu.cloud" }) }
    var activationCode by remember { mutableStateOf("") }
    var deviceName by remember { mutableStateOf(config.deviceName.ifBlank { "HP Scanner" }) }
    var locationLabel by remember { mutableStateOf(config.locationLabel) }
    var status by remember { mutableStateOf("Masukkan kode aktivasi dari admin sekolah.") }
    var testState by remember { mutableStateOf(TestState.IDLE) }
    var saving by remember { mutableStateOf(false) }
    var showAdvanced by remember { mutableStateOf(false) }

    val canSave = activationCode.trim().isNotEmpty()

    Column(
        Modifier
            .fillMaxSize()
            .padding(20.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text("Aktivasi SIAB2 Reader", style = MaterialTheme.typography.headlineMedium)
        Text(
            "Masukkan kode dari admin. Setelah aktif, pilih Mode Gerbang atau Mode Mushola dari aplikasi ini.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        StepRow(1, "Kode Aktivasi")
        OutlinedTextField(
            value = activationCode,
            onValueChange = { activationCode = it },
            label = { Text("Kode Aktivasi") },
            placeholder = { Text("Tempel kode dari admin") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )

        PrimaryActionButton(
            text = if (saving) "Mengaktifkan…" else "Aktifkan HP Ini",
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
                        config.lastScanMode = data.allowedModes.firstOrNull() ?: "GERBANG"
                        val title = readerDeviceTitle(data.allowedModes)
                        status = "$title berhasil diaktifkan. ${readerModeSummary(data.allowedModes)}. Siap dipakai scan."
                        onDone()
                    } catch (e: Exception) {
                        status = friendlyActivationMessage(e.message)
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
            Text(status, Modifier.padding(16.dp), style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        TextButton(onClick = { showAdvanced = !showAdvanced }) {
            Text(if (showAdvanced) "Sembunyikan Pengaturan Lanjutan" else "Pengaturan Lanjutan")
        }

        if (showAdvanced) {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Pengaturan Lanjutan", style = MaterialTheme.typography.titleMedium)
                    OutlinedTextField(
                        value = serverUrl,
                        onValueChange = { serverUrl = it; testState = TestState.IDLE },
                        label = { Text("Alamat Server") },
                        placeholder = { Text("https://absensi.man1rokanhulu.cloud") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = deviceName,
                        onValueChange = { deviceName = it },
                        label = { Text("Nama HP") },
                        placeholder = { Text("HP Scanner 1 / HP Scanner 2") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = locationLabel,
                        onValueChange = { locationLabel = it },
                        label = { Text("Lokasi") },
                        placeholder = { Text("Gerbang depan / Mushola") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
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
                                status = if (ok) "Server bisa dihubungi." else "Server belum bisa dihubungi. Periksa Wi-Fi."
                            }
                        }
                    )
                }
            }
        }

        Spacer(Modifier.height(4.dp))
        Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Bantuan", style = MaterialTheme.typography.titleMedium)
                Text(
                    "• Minta admin membuat kode di menu HP Scanner.\n" +
                        "• Kode hanya sekali pakai dan cepat kedaluwarsa.\n" +
                        "• Jika gagal, periksa Wi-Fi atau minta kode baru.",
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

