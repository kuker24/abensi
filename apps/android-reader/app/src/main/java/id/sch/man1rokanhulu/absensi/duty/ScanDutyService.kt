package id.sch.man1rokanhulu.absensi.duty

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import id.sch.man1rokanhulu.absensi.MainActivity
import id.sch.man1rokanhulu.absensi.R

/**
 * Foreground duty mode while the continuous QR scanner is open.
 * Keeps a modest wake/wifi lock so OS power policies are less likely to stall network IO.
 * Does not kill or silence other apps.
 */
class ScanDutyService : Service() {
    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopDuty()
                stopSelf()
                return START_NOT_STICKY
            }
            else -> startDuty()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        stopDuty()
        super.onDestroy()
    }

    private fun startDuty() {
        ensureChannel()
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        acquireLocks()
    }

    private fun stopDuty() {
        releaseLocks()
        stopForeground(STOP_FOREGROUND_REMOVE)
    }

    private fun acquireLocks() {
        if (wakeLock?.isHeld != true) {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "siab2:scan-duty").apply {
                setReferenceCounted(false)
                acquire(4 * 60 * 60 * 1000L)
            }
        }
        if (wifiLock?.isHeld != true) {
            val wifi = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            @Suppress("DEPRECATION")
            val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                WifiManager.WIFI_MODE_FULL_LOW_LATENCY
            } else {
                WifiManager.WIFI_MODE_FULL_HIGH_PERF
            }
            wifiLock = wifi?.createWifiLock(mode, "siab2:scan-wifi")?.apply {
                setReferenceCounted(false)
                acquire()
            }
        }
    }

    private fun releaseLocks() {
        runCatching { if (wakeLock?.isHeld == true) wakeLock?.release() }
        wakeLock = null
        runCatching { if (wifiLock?.isHeld == true) wifiLock?.release() }
        wifiLock = null
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Mode Kerja Scanner",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Menjaga SIAB2 Reader tetap fokus saat scan berlangsung."
            setShowBadge(false)
        }
        manager.createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        val launch = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle("SIAB2 Mode Kerja")
            .setContentText("Scanner aktif. Jangan tutup aplikasi.")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(launch)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    companion object {
        const val ACTION_START = "id.sch.man1rokanhulu.absensi.duty.START"
        const val ACTION_STOP = "id.sch.man1rokanhulu.absensi.duty.STOP"
        private const val CHANNEL_ID = "siab2_scan_duty"
        private const val NOTIFICATION_ID = 12032

        fun start(context: Context) {
            val intent = Intent(context, ScanDutyService::class.java).setAction(ACTION_START)
            ContextCompatStart.start(context, intent)
        }

        fun stop(context: Context) {
            val intent = Intent(context, ScanDutyService::class.java).setAction(ACTION_STOP)
            runCatching { context.startService(intent) }
            runCatching { context.stopService(Intent(context, ScanDutyService::class.java)) }
        }
    }
}

private object ContextCompatStart {
    fun start(context: Context, intent: Intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }
    }
}
