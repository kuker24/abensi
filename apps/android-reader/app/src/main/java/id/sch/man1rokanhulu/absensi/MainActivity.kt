package id.sch.man1rokanhulu.absensi

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import id.sch.man1rokanhulu.absensi.data.LocalConfig
import id.sch.man1rokanhulu.absensi.data.OfflineQueueRepository
import id.sch.man1rokanhulu.absensi.data.ScanHistoryStore
import id.sch.man1rokanhulu.absensi.network.SchoolHubApiClient
import id.sch.man1rokanhulu.absensi.security.QrParser
import id.sch.man1rokanhulu.absensi.ui.components.FeedbackData
import id.sch.man1rokanhulu.absensi.ui.components.FeedbackTone
import id.sch.man1rokanhulu.absensi.ui.screens.ScannerCallbacks
import id.sch.man1rokanhulu.absensi.ui.components.playFeedbackSound
import id.sch.man1rokanhulu.absensi.ui.effectiveScanMode
import id.sch.man1rokanhulu.absensi.ui.screens.HelpScreen
import id.sch.man1rokanhulu.absensi.ui.screens.HistoryScreen
import id.sch.man1rokanhulu.absensi.ui.screens.HomeScreen
import id.sch.man1rokanhulu.absensi.ui.screens.ScannerScreen
import id.sch.man1rokanhulu.absensi.ui.screens.SettingsScreen
import id.sch.man1rokanhulu.absensi.ui.screens.SetupScreen
import id.sch.man1rokanhulu.absensi.ui.screens.SplashScreen
import id.sch.man1rokanhulu.absensi.ui.theme.AppTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.IOException

class MainActivity : ComponentActivity() {
    private val cameraGranted = mutableStateOf(false)
    private val requestCamera = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        cameraGranted.value = granted
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        cameraGranted.value = hasCameraPermission()
        if (!cameraGranted.value) requestCamera.launch(Manifest.permission.CAMERA)
        setContent {
            ReaderApp(
                cameraPermissionGranted = cameraGranted.value,
                requestCameraPermission = { requestCamera.launch(Manifest.permission.CAMERA) },
                openAppSettings = {
                    startActivity(
                        Intent(
                            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            Uri.fromParts("package", packageName, null)
                        )
                    )
                }
            )
        }
    }

    override fun onResume() {
        super.onResume()
        cameraGranted.value = hasCameraPermission()
    }

    private fun hasCameraPermission(): Boolean = ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
}

private enum class Route { SPLASH, SETUP, HOME, SCANNER, SETTINGS, HELP, HISTORY }

private data class QueueRetryResult(val sent: Int, val rejected: Int, val failed: Int)

@Composable
fun ReaderApp(
    cameraPermissionGranted: Boolean = true,
    requestCameraPermission: () -> Unit = {},
    openAppSettings: () -> Unit = {}
) {
    val context = LocalContext.current
    val config = remember { LocalConfig(context) }
    val api = remember { SchoolHubApiClient { config.serverUrl } }
    val historyStore = remember { ScanHistoryStore(context) }
    val queueRepo = remember { OfflineQueueRepository(context) }
    val scope = rememberCoroutineScope()

    var route by remember { mutableStateOf(Route.SPLASH) }
    var queueCount by remember { mutableIntStateOf(0) }
    var lastFeedback by remember { mutableStateOf<FeedbackData?>(null) }
    var connection by remember { mutableStateOf(id.sch.man1rokanhulu.absensi.ui.components.ConnectionStatus.CHECKING) }

    val initialMode = remember {
        val allowed = config.allowedModes()
        effectiveScanMode(allowed, config.lastScanMode)
    }
    var mode by remember { mutableStateOf(initialMode) }

    fun chooseMode(newMode: String) {
        val effective = effectiveScanMode(config.allowedModes(), newMode)
        mode = effective
        config.lastScanMode = effective
    }

    suspend fun refreshQueueCount() {
        queueCount = runCatching { queueRepo.count() }.getOrDefault(0)
    }

    suspend fun checkConnection(): id.sch.man1rokanhulu.absensi.ui.components.ConnectionStatus {
        val started = System.currentTimeMillis()
        return runCatching {
            val ok = api.health()
            val elapsed = System.currentTimeMillis() - started
            when {
                !ok -> id.sch.man1rokanhulu.absensi.ui.components.ConnectionStatus.OFFLINE
                elapsed > 1800 -> id.sch.man1rokanhulu.absensi.ui.components.ConnectionStatus.SLOW
                else -> id.sch.man1rokanhulu.absensi.ui.components.ConnectionStatus.ONLINE
            }
        }.getOrDefault(id.sch.man1rokanhulu.absensi.ui.components.ConnectionStatus.OFFLINE)
    }

    suspend fun retryQueue(): QueueRetryResult {
        var sent = 0
        var rejected = 0
        var failed = 0
        val items = runCatching { queueRepo.listForSync() }.getOrDefault(emptyList())
        for ((entry, raw) in items) {
            val deviceId = config.deviceId
            val secret = config.readerSecret
            if (deviceId.isNullOrBlank() || secret.isNullOrBlank()) break
            try {
                val parsed = QrParser.parse(raw)
                val scan = api.scanQr(parsed.qrCode, entry.mode, deviceId, secret)
                if (scan.ok) {
                    queueRepo.delete(entry.id)
                    historyStore.add(
                        ScanHistoryStore.entry(
                            mode = entry.mode,
                            status = id.sch.man1rokanhulu.absensi.data.ScanHistoryStatus.SENT,
                            opaqueCode = parsed.opaqueCode,
                            message = scan.message.ifBlank { "Antrean terkirim." }
                        )
                    )
                    sent++
                } else {
                    queueRepo.delete(entry.id)
                    historyStore.add(
                        ScanHistoryStore.entry(
                            mode = entry.mode,
                            status = id.sch.man1rokanhulu.absensi.data.ScanHistoryStatus.REJECTED,
                            opaqueCode = parsed.opaqueCode,
                            message = scan.message.ifBlank { "Ditolak server saat kirim ulang." }
                        )
                    )
                    rejected++
                }
            } catch (_: IOException) {
                failed++
                break
            } catch (e: Exception) {
                queueRepo.delete(entry.id)
                historyStore.add(
                    ScanHistoryStore.entry(
                        mode = entry.mode,
                        status = id.sch.man1rokanhulu.absensi.data.ScanHistoryStatus.REJECTED,
                        opaqueCode = entry.qrCodeMasked,
                        message = e.message ?: "Antrean rusak dan tidak bisa dikirim."
                    )
                )
                rejected++
            }
        }
        refreshQueueCount()
        return QueueRetryResult(sent, rejected, failed)
    }

    LaunchedEffect(Unit) {
        refreshQueueCount()
    }

    LaunchedEffect(route) {
        if (route == Route.SPLASH) return@LaunchedEffect
        while (true) {
            connection = checkConnection()
            delay(15_000)
        }
    }

    AppTheme {
        when (route) {
            Route.SPLASH -> SplashScreen {
                route = if (!config.isProvisioned()) Route.SETUP
                else if (config.autoOpenScanner) Route.SCANNER
                else Route.HOME
            }
            Route.SETUP -> SetupScreen(config, api) {
                chooseMode(effectiveScanMode(config.allowedModes(), config.allowedModes().firstOrNull() ?: "CHECK_ONLY"))
                route = Route.HOME
            }
            Route.HOME -> HomeScreen(
                config = config,
                allowedModes = config.allowedModes(),
                currentMode = mode,
                connection = connection,
                queueCount = queueCount,
                recentEntries = historyStore.list().take(5),
                onMode = ::chooseMode,
                onStart = { route = Route.SCANNER },
                onSettings = { route = Route.SETTINGS },
                onHelp = { route = Route.HELP },
                onHistory = { route = Route.HISTORY },
                onRetryQueue = {
                    scope.launch {
                        val result = retryQueue()
                        lastFeedback = FeedbackData(
                            title = if (result.failed == 0) "Antrean Diproses" else "Sebagian Tertunda",
                            message = "${result.sent} terkirim, ${result.rejected} ditolak server, ${result.failed} masih menunggu internet.",
                            tone = if (result.failed == 0) FeedbackTone.SUCCESS else FeedbackTone.PENDING
                        )
                    }
                }
            )
            Route.SCANNER -> ScannerScreen(
                mode = mode,
                allowedModes = config.allowedModes(),
                config = config,
                api = api,
                queueCount = queueCount,
                historyStore = historyStore,
                cameraPermissionGranted = cameraPermissionGranted,
                requestCameraPermission = requestCameraPermission,
                openAppSettings = openAppSettings,
                callbacks = ScannerCallbacks(
                    onResult = { feedback ->
                        lastFeedback = feedback
                        if (feedback.tone == FeedbackTone.SUCCESS ||
                            feedback.tone == FeedbackTone.ERROR ||
                            feedback.tone == FeedbackTone.PENDING
                        ) {
                            playFeedbackSound(context, feedback.tone, config.soundEnabled, config.vibrationEnabled)
                        }
                        scope.launch { refreshQueueCount() }
                    },
                    onModeChange = ::chooseMode,
                    onBack = { route = Route.HOME },
                    onHelp = { route = Route.HELP },
                    onRetryQueue = {
                        scope.launch { retryQueue() }
                    },
                    onProvisioningLost = {
                        config.clearDevice()
                        route = Route.SETUP
                    }
                )
            )
            Route.SETTINGS -> SettingsScreen(
                config = config,
                api = api,
                queueCount = queueCount,
                onClearQueue = { scope.launch { runCatching { queueRepo.clear() }; refreshQueueCount() } },
                onRetryQueue = { scope.launch { retryQueue() } },
                onBack = { route = Route.HOME },
                onReprovision = { config.clearDevice(); route = Route.SETUP }
            )
            Route.HELP -> HelpScreen(onBack = { route = Route.HOME })
            Route.HISTORY -> HistoryScreen(historyStore = historyStore, onBack = { route = Route.HOME })
        }
    }
}
