package id.sch.man1rokanhulu.absensi

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.BatteryManager
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
import id.sch.man1rokanhulu.absensi.data.PendingScanRetryCoordinator
import id.sch.man1rokanhulu.absensi.data.PendingScanRetryHistoryStatus
import id.sch.man1rokanhulu.absensi.data.PendingScanRetryOrchestrator
import id.sch.man1rokanhulu.absensi.data.PendingScanRetryResponse
import id.sch.man1rokanhulu.absensi.data.ScanHistoryStore
import id.sch.man1rokanhulu.absensi.network.SchoolHubApiClient
import id.sch.man1rokanhulu.absensi.ui.components.FeedbackData
import id.sch.man1rokanhulu.absensi.ui.components.FeedbackTone
import id.sch.man1rokanhulu.absensi.ui.screens.ScannerCallbacks
import id.sch.man1rokanhulu.absensi.ui.components.playFeedbackSound
import id.sch.man1rokanhulu.absensi.ui.effectiveScanMode
import id.sch.man1rokanhulu.absensi.ui.hasSelectableScanMode
import id.sch.man1rokanhulu.absensi.ui.safeScanHistoryMessage
import id.sch.man1rokanhulu.absensi.ui.screens.ForcedUpdateScreen
import id.sch.man1rokanhulu.absensi.ui.screens.HelpScreen
import id.sch.man1rokanhulu.absensi.ui.screens.HistoryScreen
import id.sch.man1rokanhulu.absensi.ui.screens.HomeScreen
import id.sch.man1rokanhulu.absensi.ui.screens.ScannerScreen
import id.sch.man1rokanhulu.absensi.ui.screens.SettingsScreen
import id.sch.man1rokanhulu.absensi.ui.screens.SetupScreen
import id.sch.man1rokanhulu.absensi.ui.screens.SplashScreen
import id.sch.man1rokanhulu.absensi.ui.theme.AppTheme
import id.sch.man1rokanhulu.absensi.update.ApkUpdateInstaller
import id.sch.man1rokanhulu.absensi.update.ApkUpdatePolicy
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Instant

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

private data class QueueRetryResult(val sent: Int, val rejected: Int, val pending: Int, val parked: Int)

private fun batteryLevelPercent(context: Context): Int? {
    val battery = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)) ?: return null
    val level = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
    val scale = battery.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
    if (level < 0 || scale <= 0) return null
    return (level * 100 / scale).coerceIn(0, 100)
}

private fun networkStatusLabel(context: Context): String {
    val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return "UNKNOWN"
    val network = manager.activeNetwork ?: return "OFFLINE"
    val caps = manager.getNetworkCapabilities(network) ?: return "OFFLINE"
    return when {
        caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WIFI"
        caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "CELLULAR"
        caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ETHERNET"
        caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) -> "ONLINE"
        else -> "OFFLINE"
    }
}

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
    val retryCoordinator = remember { PendingScanRetryCoordinator() }
    val scope = rememberCoroutineScope()

    var route by remember { mutableStateOf(Route.SPLASH) }
    var queueCount by remember { mutableIntStateOf(0) }
    var retryQueueBusy by remember { mutableStateOf(false) }
    var lastFeedback by remember { mutableStateOf<FeedbackData?>(null) }
    var connection by remember { mutableStateOf(id.sch.man1rokanhulu.absensi.ui.components.ConnectionStatus.CHECKING) }
    var updateInfo by remember { mutableStateOf<SchoolHubApiClient.VersionInfo?>(null) }
    var updateBusy by remember { mutableStateOf(false) }
    var updateMessage by remember { mutableStateOf<String?>(null) }
    var updateDismissedCode by remember { mutableIntStateOf(0) }

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

    fun effectiveUpdateInfo(): SchoolHubApiClient.VersionInfo? {
        val info = updateInfo ?: return null
        if (info.latestVersionCode == updateDismissedCode && !ApkUpdatePolicy.isForceUpdate(info)) return null
        return info
    }

    fun sendReaderStatus(statusMessage: String? = null, includeCurrentMode: Boolean = true) {
        val deviceId = config.deviceId
        val secret = config.readerSecret
        if (deviceId.isNullOrBlank() || secret.isNullOrBlank()) return
        scope.launch {
            runCatching {
                val pending = queueRepo.count()
                val battery = batteryLevelPercent(context)
                val network = networkStatusLabel(context)
                val warnings = mutableListOf<String>()
                if (pending > 0) warnings.add("OFFLINE_QUEUE_PENDING")
                if (battery != null && battery <= 20) warnings.add("LOW_BATTERY")
                if (network == "OFFLINE") warnings.add("NETWORK_OFFLINE")
                val result = api.sendReaderStatus(
                    SchoolHubApiClient.ReaderStatusPayload(
                        pendingQueueCount = pending,
                        currentMode = if (includeCurrentMode) mode else null,
                        lastQueueFlushAt = config.lastQueueFlushAt,
                        batteryLevel = battery,
                        networkStatus = network,
                        statusMessage = statusMessage,
                        warnings = warnings
                    ),
                    deviceId,
                    secret
                )
                result?.allowedModes?.let { allowedModes ->
                    config.allowedModesCsv = allowedModes.joinToString(",")
                    chooseMode(effectiveScanMode(allowedModes, mode))
                }
            }
        }
    }

    fun checkForUpdate(manual: Boolean = false) {
        val now = System.currentTimeMillis()
        if (!manual && now - config.lastUpdateCheckAtMs < 30 * 60 * 1000) return
        scope.launch {
            if (manual) updateMessage = "Memeriksa update APK…"
            val result = runCatching { api.version() }
            config.lastUpdateCheckAtMs = now
            result.onSuccess { info ->
                updateInfo = info
                updateMessage = when {
                    ApkUpdatePolicy.isForceUpdate(info) -> "Update wajib tersedia. Download lalu konfirmasi installer Android."
                    ApkUpdatePolicy.isUpdateAvailable(info) -> "Update tersedia. Tes di 1 HP sebelum rollout production."
                    manual -> "Aplikasi sudah versi terbaru."
                    else -> updateMessage
                }
            }.onFailure {
                if (manual) updateMessage = "Belum bisa cek update. Scanner tetap bisa dipakai jika tidak ada update wajib tersimpan."
            }
        }
    }

    fun installUpdate() {
        val info = updateInfo ?: return
        scope.launch {
            updateBusy = true
            updateMessage = "Mengunduh APK…"
            try {
                val apk = ApkUpdateInstaller.downloadAndVerify(context, config.serverUrl, info)
                if (!ApkUpdateInstaller.canRequestInstall(context)) {
                    updateMessage = "Aktifkan izin Install unknown apps untuk SIAB2 Reader, lalu tekan Download / Install lagi."
                    ApkUpdateInstaller.openUnknownAppSettings(context)
                } else {
                    updateMessage = "Membuka installer Android. Konfirmasi install secara manual."
                    ApkUpdateInstaller.openInstaller(context, apk)
                }
            } catch (e: Exception) {
                updateMessage = e.message ?: "Update gagal. Coba lagi saat internet stabil."
            } finally {
                updateBusy = false
            }
        }
    }

    fun queueRetryMessage(result: QueueRetryResult): String = buildString {
        append("${result.sent} terkirim, ${result.rejected} ditolak server, ${result.pending} masih menunggu.")
        if (result.parked > 0) append(" ${result.parked} perlu tindakan operator setelah 10 percobaan.")
    }

    fun queueRetryFeedback(result: QueueRetryResult): FeedbackData = FeedbackData(
        title = if (result.pending == 0 && result.parked == 0) "Antrean Diproses" else "Antrean Menunggu",
        message = queueRetryMessage(result),
        tone = if (result.pending == 0 && result.parked == 0) FeedbackTone.SUCCESS else FeedbackTone.PENDING
    )

    suspend fun retryQueue(): QueueRetryResult? = retryCoordinator.runIfIdle {
        retryQueueBusy = true
        try {
            val result = PendingScanRetryOrchestrator(
            queue = queueRepo,
            credentialsAvailable = {
                !config.deviceId.isNullOrBlank() && !config.readerSecret.isNullOrBlank()
            },
            send = { item, clientScannedAt ->
                val deviceId = config.deviceId ?: error("HP belum diaktifkan.")
                val secret = config.readerSecret ?: error("HP belum diaktifkan.")
                val scan = api.scanQr(item.parsedQr.qrCode, item.mode, deviceId, secret, clientScannedAt)
                PendingScanRetryResponse(scan.ok, scan.message, scan.statusCode)
            },
            recordHistory = { event ->
                historyStore.add(
                    ScanHistoryStore.entry(
                        mode = event.mode,
                        status = when (event.status) {
                            PendingScanRetryHistoryStatus.SENT -> id.sch.man1rokanhulu.absensi.data.ScanHistoryStatus.SENT
                            PendingScanRetryHistoryStatus.REJECTED -> id.sch.man1rokanhulu.absensi.data.ScanHistoryStatus.REJECTED
                        },
                        opaqueCode = event.opaqueCode,
                        message = event.message
                    )
                )
            },
            sanitizeMessage = ::safeScanHistoryMessage
            ).flush()
            if (result.sent > 0) config.lastQueueFlushAt = Instant.now().toString()
            refreshQueueCount()
            if (result.sent > 0 || result.rejected > 0 || result.pending > 0 || result.parked > 0) {
                sendReaderStatus("Antrean offline diproses")
            }
            QueueRetryResult(result.sent, result.rejected, result.pending, result.parked)
        } finally {
            retryQueueBusy = false
        }
    }

    LaunchedEffect(Unit) {
        refreshQueueCount()
        // The server is authoritative: refresh modes before reporting a legacy mode.
        sendReaderStatus("Aplikasi dibuka", includeCurrentMode = false)
        checkForUpdate(manual = false)
    }

    LaunchedEffect(route) {
        if (route == Route.SPLASH) return@LaunchedEffect
        while (true) {
            connection = checkConnection()
            delay(15_000)
        }
    }

    LaunchedEffect(route, mode) {
        if (route != Route.SCANNER) return@LaunchedEffect
        sendReaderStatus("Scanner aktif")
        while (true) {
            delay(60_000)
            sendReaderStatus("Scanner aktif")
        }
    }

    AppTheme {
        val visibleUpdateInfo = effectiveUpdateInfo()
        if (visibleUpdateInfo != null && ApkUpdatePolicy.isForceUpdate(visibleUpdateInfo) && route != Route.SETTINGS && route != Route.HELP) {
            ForcedUpdateScreen(
                info = visibleUpdateInfo,
                busy = updateBusy,
                message = updateMessage,
                onInstall = ::installUpdate,
                onSettings = { route = Route.SETTINGS },
                onHelp = { route = Route.HELP }
            )
            return@AppTheme
        }
        when (route) {
            Route.SPLASH -> SplashScreen {
                route = if (!config.isProvisioned()) Route.SETUP else Route.HOME
            }
            Route.SETUP -> SetupScreen(config, api) {
                chooseMode(effectiveScanMode(config.allowedModes(), config.allowedModes().firstOrNull().orEmpty()))
                route = Route.HOME
            }
            Route.HOME -> HomeScreen(
                config = config,
                allowedModes = config.allowedModes(),
                connection = connection,
                queueCount = queueCount,
                recentEntries = historyStore.list().take(5),
                updateInfo = visibleUpdateInfo,
                updateBusy = updateBusy,
                updateMessage = updateMessage,
                onInstallUpdate = ::installUpdate,
                onDismissUpdate = { updateDismissedCode = updateInfo?.latestVersionCode ?: 0 },
                onMode = ::chooseMode,
                onStart = {
                    if (hasSelectableScanMode(config.allowedModes())) route = Route.SCANNER
                },
                onSettings = { route = Route.SETTINGS },
                onHelp = { route = Route.HELP },
                onHistory = { route = Route.HISTORY },
                onRetryQueue = {
                    scope.launch {
                        retryQueue()?.let { lastFeedback = queueRetryFeedback(it) }
                    }
                },
                retryQueueBusy = retryQueueBusy
            )
            Route.SCANNER -> ScannerScreen(
                mode = mode,
                allowedModes = config.allowedModes(),
                config = config,
                api = api,
                queueCount = queueCount,
                connection = connection,
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
                        scope.launch {
                            refreshQueueCount()
                            if (feedback.tone == FeedbackTone.PENDING) sendReaderStatus("Scan masuk antrean offline")
                        }
                    },
                    onModeChange = ::chooseMode,
                    onBack = { route = Route.HOME },
                    onHelp = { route = Route.HELP },
                    onRetryQueue = {
                        val retryFeedback = retryQueue()?.let(::queueRetryFeedback)
                            ?: FeedbackData("Antrean Sedang Dikirim", "Pengiriman ulang sudah berjalan. Tunggu hingga selesai.", FeedbackTone.PROCESSING)
                        lastFeedback = retryFeedback
                        retryFeedback
                    },
                    retryQueueBusy = retryQueueBusy,
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
                onRetryQueue = {
                    retryQueue()?.let(::queueRetryMessage)
                        ?: "Pengiriman ulang antrean sudah berjalan. Tunggu hingga selesai."
                },
                retryQueueBusy = retryQueueBusy,
                onCheckUpdate = { checkForUpdate(manual = true) },
                updateStatus = updateMessage,
                onBack = { route = Route.HOME },
                onReprovision = { config.clearDevice(); route = Route.SETUP }
            )
            Route.HELP -> HelpScreen(onBack = { route = Route.HOME })
            Route.HISTORY -> HistoryScreen(historyStore = historyStore, onBack = { route = Route.HOME })
        }
    }
}
