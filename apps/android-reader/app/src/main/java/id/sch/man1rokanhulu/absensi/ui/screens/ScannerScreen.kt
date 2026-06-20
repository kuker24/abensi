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
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.runtime.LaunchedEffect
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
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.IOException

data class ScannerCallbacks(
    val onResult: (FeedbackData) -> Unit,
    val onModeChange: (String) -> Unit,
    val onBack: () -> Unit,
    val onHelp: () -> Unit,
    val onRetryQueue: () -> Unit,
    val onProvisioningLost: () -> Unit = {}
)

@Composable
fun ScannerScreen(
    mode: String,
    allowedModes: List<String>,
    config: LocalConfig,
    api: SchoolHubApiClient,
    queueCount: Int,
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
    var connection by remember { mutableStateOf(ConnectionStatus.CHECKING) }
    var torchOn by remember { mutableStateOf(false) }
    var paused by remember { mutableStateOf(false) }
    var confirmModeChange by remember { mutableStateOf(false) }
    var cameraControl by remember { mutableStateOf<CameraControl?>(null) }

    DisposableEffect(config.keepScreenOn) {
        val activity = context as? ComponentActivity
        if (config.keepScreenOn) activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onDispose { activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }
    }

    LaunchedEffect(Unit) {
        while (true) {
            val started = System.currentTimeMillis()
            connection = runCatching {
                val ok = api.health()
                val elapsed = System.currentTimeMillis() - started
                when {
                    !ok -> ConnectionStatus.OFFLINE
                    elapsed > 1800 -> ConnectionStatus.SLOW
                    else -> ConnectionStatus.ONLINE
                }
            }.getOrDefault(ConnectionStatus.OFFLINE)
            delay(15_000)
        }
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
                                        FeedbackData(friendlyScanTitle(true, friendly), friendly.ifBlank { "Scan diterima." }, FeedbackTone.SUCCESS)
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
                                        if (shouldResetProvisioning(scan.message)) callbacks.onProvisioningLost()
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

        // Aiming overlay (visual guide)
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(60.dp),
            contentAlignment = Alignment.Center
        ) {
            Box(
                Modifier
                    .size(240.dp)
                    .border(width = 2.dp, color = MaterialTheme.colorScheme.primary.copy(alpha = 0.7f), shape = RoundedCornerShape(20.dp))
                    .semantics { contentDescription = "Area scan QR code" }
            )
        }

        Column(
            Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(14.dp),
            verticalArrangement = Arrangement.SpaceBetween
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
                            onClick = callbacks.onRetryQueue,
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
            Spacer(Modifier.height(0.dp))
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

private data class ServerScanSummary(
    val displayName: String? = null,
    val displayMeta: String? = null,
    val actionLabel: String? = null
)

private fun parseServerScanSummary(body: String): ServerScanSummary = runCatching {
    val obj = JSONObject(body.ifBlank { "{}" })
    val user = obj.optJSONObject("user")
    val item = obj.optJSONObject("item")
    val name = user?.optString("fullName")?.ifBlank { null }
    val role = user?.optString("role")?.ifBlank { null }?.replace('_', ' ')
    val className = user?.optString("className")?.ifBlank { null }
    val action = obj.optString("action").ifBlank { null }
    val kind = obj.optString("kind").ifBlank { null }
    val prayer = item?.optString("prayerType")?.ifBlank { null }
    val actionLabel = when {
        !action.isNullOrBlank() -> action
        kind == "PRAYER" && !prayer.isNullOrBlank() -> prayer.lowercase().replaceFirstChar { it.uppercase() }
        kind == "CHECK_ONLY" -> "Cek QR"
        else -> kind
    }
    val meta = listOfNotNull(role, className).joinToString(" · ").ifBlank { null }
    ServerScanSummary(name, meta, actionLabel)
}.getOrDefault(ServerScanSummary())
