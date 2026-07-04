package id.sch.man1rokanhulu.absensi.ui.screens

import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.camera.core.CameraControl
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import id.sch.man1rokanhulu.absensi.data.LocalConfig
import id.sch.man1rokanhulu.absensi.data.OfflineQueueRepository
import id.sch.man1rokanhulu.absensi.data.ScanHistoryEntry
import id.sch.man1rokanhulu.absensi.data.ScanHistoryStatus
import id.sch.man1rokanhulu.absensi.data.ScanHistoryStore
import id.sch.man1rokanhulu.absensi.network.SchoolHubApiClient
import id.sch.man1rokanhulu.absensi.scanner.BarcodeAnalyzer
import id.sch.man1rokanhulu.absensi.scanner.ContinuousScanGate
import id.sch.man1rokanhulu.absensi.security.QrParser
import id.sch.man1rokanhulu.absensi.ui.components.ConfirmDialog
import id.sch.man1rokanhulu.absensi.ui.components.ConnectionStatus
import id.sch.man1rokanhulu.absensi.ui.components.FeedbackCard
import id.sch.man1rokanhulu.absensi.ui.components.FeedbackData
import id.sch.man1rokanhulu.absensi.ui.components.FeedbackTone
import id.sch.man1rokanhulu.absensi.ui.components.StatusBar
import id.sch.man1rokanhulu.absensi.ui.friendlyScanMessage
import id.sch.man1rokanhulu.absensi.ui.friendlyScanTitle
import id.sch.man1rokanhulu.absensi.ui.readerDeviceTitle
import id.sch.man1rokanhulu.absensi.ui.readerModeSummary
import id.sch.man1rokanhulu.absensi.ui.scanModeHelper
import id.sch.man1rokanhulu.absensi.ui.scanModeTitle
import id.sch.man1rokanhulu.absensi.ui.shouldResetProvisioning
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.IOException

data class ScannerCallbacks(
    val onResult: (FeedbackData) -> Unit,
    val onModeChange: (String) -> Unit,
    val onBack: () -> Unit,
    val onHelp: () -> Unit,
    val onRetryQueue: suspend () -> FeedbackData,
    val onProvisioningLost: () -> Unit = {}
)

@Composable
fun ScannerScreen(
    mode: String,
    allowedModes: List<String>,
    config: LocalConfig,
    api: SchoolHubApiClient,
    queueCount: Int,
    connection: ConnectionStatus,
    historyStore: ScanHistoryStore,
    cameraPermissionGranted: Boolean,
    requestCameraPermission: () -> Unit,
    openAppSettings: () -> Unit,
    callbacks: ScannerCallbacks
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val queue = remember { OfflineQueueRepository(context) }
    val scanGate = remember { ContinuousScanGate(3000) }
    val latestMode by rememberUpdatedState(mode)
    val deviceTitle = readerDeviceTitle(allowedModes)
    val deviceSummary = readerModeSummary(allowedModes)
    var feedback by remember { mutableStateOf(FeedbackData("Siap Scan", "Arahkan QR ke kamera. Tahan stabil sampai berbunyi.", FeedbackTone.IDLE)) }
    var busy by remember { mutableStateOf(false) }
    var torchOn by remember { mutableStateOf(false) }
    var paused by remember { mutableStateOf(false) }
    var confirmModeChange by remember { mutableStateOf(false) }
    var cameraControl by remember { mutableStateOf<CameraControl?>(null) }

    DisposableEffect(config.keepScreenOn) {
        val activity = context as? ComponentActivity
        if (config.keepScreenOn) activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onDispose { activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }
    }

    if (!cameraPermissionGranted) {
        CameraPermissionRequiredScreen(
            callbacks = callbacks,
            requestCameraPermission = requestCameraPermission,
            openAppSettings = openAppSettings
        )
        return
    }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        AndroidView(factory = { ctx ->
            val previewView = PreviewView(ctx)
            val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
            cameraProviderFuture.addListener({
                try {
                    val provider = cameraProviderFuture.get()
                    val preview = Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
                    val analysis = ImageAnalysis.Builder().setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build().also {
                        it.setAnalyzer(ContextCompat.getMainExecutor(ctx), BarcodeAnalyzer { raw ->
                            if (paused) return@BarcodeAnalyzer
                            if (!scanGate.tryStart(raw)) return@BarcodeAnalyzer
                            busy = true
                            feedback = FeedbackData("Memproses…", "Tunggu sebentar. QR sedang dicek ke server.", FeedbackTone.PROCESSING)
                            scope.launch {
                                val nextFeedback = try {
                                    val parsed = QrParser.parse(raw)
                                    val deviceId = config.deviceId ?: error("HP belum diaktifkan.")
                                    val secret = config.readerSecret ?: error("HP belum diaktifkan.")
                                    val scan = api.scanQr(parsed.qrCode, latestMode, deviceId, secret)
                                    val friendly = friendlyScanMessage(scan.message)
                                    val summary = parseServerScanSummary(scan.body)
                                    if (scan.ok) {
                                        historyStore.add(
                                            ScanHistoryEntry(
                                                timestamp = System.currentTimeMillis(),
                                                mode = latestMode,
                                                status = ScanHistoryStatus.SENT,
                                                maskedCode = ScanHistoryStore.maskQr(parsed.opaqueCode),
                                                message = friendly.ifBlank { "Scan diterima." },
                                                displayName = summary.displayName,
                                                displayMeta = summary.displayMeta,
                                                actionLabel = summary.actionLabel
                                            )
                                        )
                                        FeedbackData(summary.actionLabel ?: friendlyScanTitle(true, friendly), summary.feedbackMessage ?: friendly.ifBlank { "Scan diterima." }, FeedbackTone.SUCCESS)
                                    } else {
                                        historyStore.add(
                                            ScanHistoryEntry(
                                                timestamp = System.currentTimeMillis(),
                                                mode = latestMode,
                                                status = ScanHistoryStatus.REJECTED,
                                                maskedCode = ScanHistoryStore.maskQr(parsed.opaqueCode),
                                                message = friendly.ifBlank { "Scan ditolak server." },
                                                displayName = summary.displayName,
                                                displayMeta = summary.displayMeta,
                                                actionLabel = summary.actionLabel
                                            )
                                        )
                                        if (shouldResetProvisioning(scan.message, scan.statusCode)) callbacks.onProvisioningLost()
                                        FeedbackData(friendlyScanTitle(false, friendly), friendly.ifBlank { "Scan ditolak server." }, FeedbackTone.ERROR)
                                    }
                                } catch (e: IOException) {
                                    val saved = runCatching { queue.enqueue(raw, latestMode) }.getOrDefault(false)
                                    runCatching { QrParser.parse(raw) }.getOrNull()?.let { parsed ->
                                        historyStore.add(
                                            ScanHistoryEntry(
                                                timestamp = System.currentTimeMillis(),
                                                mode = latestMode,
                                                status = if (saved) ScanHistoryStatus.QUEUED else ScanHistoryStatus.REJECTED,
                                                maskedCode = ScanHistoryStore.maskQr(parsed.opaqueCode),
                                                message = if (saved) "Disimpan ke antrean kirim." else "Antrean penuh. Scan belum tersimpan."
                                            )
                                        )
                                    }
                                    if (saved) {
                                        FeedbackData("Internet Bermasalah", "Scan disimpan sementara. Akan terkirim begitu internet pulih.", FeedbackTone.PENDING)
                                    } else {
                                        FeedbackData("Antrean Penuh", "Scan belum tersimpan. Sambungkan internet lalu coba scan lagi.", FeedbackTone.ERROR)
                                    }
                                } catch (e: Exception) {
                                    val friendly = friendlyScanMessage(e.message)
                                    if (shouldResetProvisioning(e.message)) callbacks.onProvisioningLost()
                                    FeedbackData(friendlyScanTitle(false, friendly), friendly, FeedbackTone.ERROR)
                                }
                                feedback = nextFeedback
                                callbacks.onResult(nextFeedback)
                                busy = false
                                scanGate.finish()
                            }
                        })
                    }
                    provider.unbindAll()
                    val camera = provider.bindToLifecycle(ctx as ComponentActivity, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
                    cameraControl = camera.cameraControl
                    cameraControl?.enableTorch(torchOn)
                } catch (e: Exception) {
                    feedback = FeedbackData("Kamera Gagal", e.message ?: "Kamera tidak bisa dibuka. Pastikan izin kamera aktif dan tidak ada aplikasi lain yang memakai kamera.", FeedbackTone.ERROR)
                    callbacks.onResult(feedback)
                }
            }, ContextCompat.getMainExecutor(ctx))
            previewView
        }, modifier = Modifier.fillMaxSize())

        Column(
            Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = 14.dp, vertical = 12.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                StatusBar(
                    connection = connection,
                    queueCount = queueCount,
                    locationLabel = config.locationLabel.ifBlank { "$deviceTitle · $deviceSummary" },
                    compact = true
                )
                Box(
                    Modifier
                        .clip(RoundedCornerShape(14.dp))
                        .background(Color.Black.copy(alpha = 0.55f))
                        .padding(12.dp)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        Text("MODE AKTIF", color = Color.White.copy(alpha = 0.72f), style = MaterialTheme.typography.labelLarge)
                        Text(scanModeTitle(mode), color = Color.White, style = MaterialTheme.typography.headlineSmall)
                        Text(scanModeHelper(mode), color = Color.White.copy(alpha = 0.84f), style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }

            BoxWithConstraints(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .padding(top = 12.dp, bottom = 16.dp),
                contentAlignment = Alignment.Center
            ) {
                val availableFrame = minOf(maxWidth - 24.dp, maxHeight - 16.dp, 236.dp)
                val frameMin = if (maxHeight < 176.dp) 120.dp else 168.dp
                val frameSize = availableFrame.coerceAtLeast(frameMin)
                Box(
                    Modifier
                        .size(frameSize)
                        .border(width = 2.dp, color = MaterialTheme.colorScheme.primary.copy(alpha = 0.82f), shape = RoundedCornerShape(20.dp))
                        .semantics { contentDescription = "Area scan QR code" }
                )
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(18.dp))
                    .background(Color.Black.copy(alpha = 0.62f))
                    .padding(10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                FeedbackCard(feedback)
                if (paused) {
                    Text(
                        "Scan dijeda. Tekan Mulai Scan untuk melanjutkan.",
                        color = Color.White,
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    Button(
                        onClick = { paused = !paused },
                        modifier = Modifier.weight(1f).height(50.dp),
                        colors = if (paused) scannerPrimaryButtonColors() else scannerDarkButtonColors()
                    ) { Text(if (paused) "Mulai Scan" else "Jeda Scan") }
                    Button(
                        onClick = {
                            torchOn = !torchOn
                            cameraControl?.enableTorch(torchOn)
                        },
                        modifier = Modifier.weight(1f).height(50.dp),
                        colors = scannerDarkButtonColors()
                    ) { Text(if (torchOn) "Lampu ON" else "Lampu") }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    if (queueCount > 0) {
                        Button(
                            onClick = {
                                scope.launch {
                                    feedback = FeedbackData("Mengirim Antrean…", "Mencoba mengirim ulang scan yang menunggu internet.", FeedbackTone.PROCESSING)
                                    val retryFeedback = callbacks.onRetryQueue()
                                    feedback = retryFeedback
                                }
                            },
                            modifier = Modifier.weight(1f).height(50.dp),
                            colors = scannerPrimaryButtonColors()
                        ) { Text("Kirim ($queueCount)") }
                    }
                    Button(
                        onClick = callbacks.onHelp,
                        modifier = Modifier.weight(1f).height(50.dp),
                        colors = scannerDarkButtonColors()
                    ) { Text("Bantuan") }
                    Button(
                        onClick = { confirmModeChange = true },
                        modifier = Modifier.weight(1f).height(50.dp),
                        colors = scannerDarkButtonColors()
                    ) { Text("Ubah Mode") }
                }
            }
        }

        if (confirmModeChange) {
            ConfirmDialog(
                title = "Yakin ubah mode scan?",
                message = "Scan akan ditutup agar operator memilih Mode Gerbang atau Mode Mushola.",
                confirmLabel = "Ubah Mode",
                onConfirm = {
                    confirmModeChange = false
                    callbacks.onBack()
                },
                onDismiss = { confirmModeChange = false }
            )
        }
    }
}

@Composable
private fun CameraPermissionRequiredScreen(
    callbacks: ScannerCallbacks,
    requestCameraPermission: () -> Unit,
    openAppSettings: () -> Unit
) {
    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black)
            .statusBarsPadding()
            .navigationBarsPadding()
            .padding(20.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .clip(RoundedCornerShape(22.dp))
                .background(Color(0xFF1E2025))
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                "Izin Kamera Belum Aktif",
                color = Color.White,
                style = MaterialTheme.typography.headlineSmall
            )
            Text(
                "HP Scanner perlu izin kamera untuk membaca QR. Aktifkan izin kamera, lalu buka mode scan lagi.",
                color = Color.White.copy(alpha = 0.82f),
                style = MaterialTheme.typography.bodyMedium
            )
            Button(
                onClick = requestCameraPermission,
                modifier = Modifier.fillMaxWidth().height(50.dp),
                colors = scannerPrimaryButtonColors()
            ) { Text("Izinkan Kamera") }
            Button(
                onClick = openAppSettings,
                modifier = Modifier.fillMaxWidth().height(50.dp),
                colors = scannerDarkButtonColors()
            ) { Text("Buka Pengaturan HP") }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                Button(
                    onClick = callbacks.onHelp,
                    modifier = Modifier.weight(1f).height(48.dp),
                    colors = scannerDarkButtonColors()
                ) { Text("Bantuan") }
                Button(
                    onClick = callbacks.onBack,
                    modifier = Modifier.weight(1f).height(48.dp),
                    colors = scannerDarkButtonColors()
                ) { Text("Kembali") }
            }
        }
    }
}

@Composable
private fun scannerPrimaryButtonColors() = ButtonDefaults.buttonColors(
    containerColor = MaterialTheme.colorScheme.primary,
    contentColor = MaterialTheme.colorScheme.onPrimary,
    disabledContainerColor = Color(0xFF1E2025),
    disabledContentColor = Color.White.copy(alpha = 0.58f)
)

@Composable
private fun scannerDarkButtonColors() = ButtonDefaults.buttonColors(
    containerColor = Color(0xFF232529),
    contentColor = Color.White,
    disabledContainerColor = Color(0xFF1E2025),
    disabledContentColor = Color.White.copy(alpha = 0.58f)
)

internal data class ServerScanSummary(
    val displayName: String? = null,
    val displayMeta: String? = null,
    val actionLabel: String? = null,
    val feedbackMessage: String? = null
)

internal fun parseServerScanSummary(body: String): ServerScanSummary = runCatching {
    val obj = JSONObject(body.ifBlank { "{}" })
    val user = obj.optJSONObject("user")
    val item = obj.optJSONObject("item")
    val name = safeOptString(user, "fullName")
    val roleRaw = safeOptString(user, "role")
    val role = roleRaw?.replace('_', ' ')
    val className = safeOptString(user, "className")
    val cardStatus = safeOptString(user, "cardStatus")
    val action = safeOptString(obj, "action")
    val kind = safeOptString(obj, "kind")
    val prayer = safeOptString(item, "prayerType")
    val actionLabel = when {
        !action.isNullOrBlank() -> action
        kind == "PRAYER" && !prayer.isNullOrBlank() -> prayer.lowercase().replaceFirstChar { it.uppercase() }
        kind == "CHECK_ONLY" -> "Cek Identitas"
        else -> kind
    }
    if (kind == "CHECK_ONLY" && user != null) {
        return@runCatching buildCheckOnlySummary(
            name = name,
            roleRaw = roleRaw,
            className = className,
            cardStatus = cardStatus,
            nis = safeOptString(user, "nis"),
            nip = safeOptString(user, "nip"),
            birthDate = safeOptString(user, "birthDate")
        )
    }
    val meta = listOfNotNull(role, className).joinToString(" · ").ifBlank { null }
    ServerScanSummary(name, meta, actionLabel)
}.getOrDefault(ServerScanSummary())

private fun safeOptString(obj: JSONObject?, key: String): String? {
    val value = obj?.opt(key) ?: return null
    if (value == JSONObject.NULL) return null
    return cleanIdentityText(value.toString())
}

private fun cleanIdentityText(value: String?): String? {
    val text = value?.trim().orEmpty()
    if (text.isBlank()) return null
    if (text.equals("null", ignoreCase = true)) return null
    if (text.equals("undefined", ignoreCase = true)) return null
    return text
}

internal fun buildCheckOnlySummary(
    name: String?,
    roleRaw: String?,
    className: String?,
    cardStatus: String?,
    nis: String?,
    nip: String?,
    birthDate: String?
): ServerScanSummary {
    val safeName = cleanIdentityText(name)
    val safeRoleRaw = cleanIdentityText(roleRaw)
    val safeClassName = cleanIdentityText(className)
    val safeCardStatus = cleanIdentityText(cardStatus)
    val safeNis = cleanIdentityText(nis)
    val safeNip = cleanIdentityText(nip)
    val safeBirthDate = cleanIdentityText(birthDate)
    val role = safeRoleRaw?.replace('_', ' ')
    val lines = if (safeRoleRaw == "SISWA") {
        listOfNotNull(
            safeName?.let { "Nama: $it" },
            safeNis?.let { "NIS: $it" },
            safeBirthDate?.let { "Tanggal lahir: $it" },
            safeClassName?.let { "Kelas: $it" },
            safeCardStatus?.let { "Status kartu: $it" }
        )
    } else {
        listOfNotNull(
            safeName?.let { "Nama: $it" },
            safeNip?.let { "NIP: $it" },
            role?.let { "Role/Jabatan: $it" },
            safeCardStatus?.let { "Status kartu: $it" }
        )
    }
    val meta = if (safeRoleRaw == "SISWA") {
        listOfNotNull("SISWA", safeClassName, safeNis?.let { "NIS $it" }).joinToString(" · ").ifBlank { null }
    } else {
        listOfNotNull(role, safeNip?.let { "NIP $it" }).joinToString(" · ").ifBlank { null }
    }
    return ServerScanSummary(
        displayName = safeName,
        displayMeta = meta,
        actionLabel = "Cek Identitas",
        feedbackMessage = lines.joinToString("\n").ifBlank { "QR valid. Tidak ada presensi yang dicatat." }
    )
}
