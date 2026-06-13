package id.sch.man1rokanhulu.absensi.data

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import id.sch.man1rokanhulu.absensi.BuildConfig
import java.util.UUID

class LocalConfig(context: Context) {
    private val plain = context.getSharedPreferences("schoolhub-reader-config", Context.MODE_PRIVATE)
    private val secure by lazy {
        val key = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        EncryptedSharedPreferences.create(
            context,
            "schoolhub-reader-secure",
            key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    var serverUrl: String
        get() = plain.getString("serverUrl", BuildConfig.SERVER_BASE_URL) ?: BuildConfig.SERVER_BASE_URL
        set(value) = plain.edit().putString("serverUrl", value.trim().removeSuffix("/")).apply()

    var deviceId: String?
        get() = plain.getString("deviceId", null)
        set(value) {
            val edit = plain.edit()
            if (value.isNullOrBlank()) edit.remove("deviceId") else edit.putString("deviceId", value)
            edit.apply()
        }

    val installDeviceId: String
        get() {
            val existing = plain.getString("installDeviceId", null)
            if (!existing.isNullOrBlank()) return existing
            val created = "android-${UUID.randomUUID()}"
            plain.edit().putString("installDeviceId", created).apply()
            return created
        }

    var deviceName: String
        get() = plain.getString("deviceName", android.os.Build.MODEL ?: "Android Reader") ?: "Android Reader"
        set(value) = plain.edit().putString("deviceName", value).apply()

    var allowedModesCsv: String
        get() = plain.getString("allowedModes", "GATE_IN,GATE_OUT,MUSHOLA,CHECK_ONLY") ?: "GATE_IN,GATE_OUT,MUSHOLA,CHECK_ONLY"
        set(value) = plain.edit().putString("allowedModes", value).apply()

    var lastScanMode: String
        get() = plain.getString("lastScanMode", "GATE_IN") ?: "GATE_IN"
        set(value) = plain.edit().putString("lastScanMode", value).apply()

    var autoOpenScanner: Boolean
        get() = plain.getBoolean("autoOpenScanner", false)
        set(value) = plain.edit().putBoolean("autoOpenScanner", value).apply()

    var keepScreenOn: Boolean
        get() = plain.getBoolean("keepScreenOn", true)
        set(value) = plain.edit().putBoolean("keepScreenOn", value).apply()

    var soundEnabled: Boolean
        get() = plain.getBoolean("soundEnabled", true)
        set(value) = plain.edit().putBoolean("soundEnabled", value).apply()

    var vibrationEnabled: Boolean
        get() = plain.getBoolean("vibrationEnabled", true)
        set(value) = plain.edit().putBoolean("vibrationEnabled", value).apply()

    var locationLabel: String
        get() = plain.getString("locationLabel", "") ?: ""
        set(value) = plain.edit().putString("locationLabel", value.trim()).apply()

    var readerSecret: String?
        get() = secure.getString("readerSecret", null)
        set(value) {
            val edit = secure.edit()
            if (value.isNullOrBlank()) edit.remove("readerSecret") else edit.putString("readerSecret", value)
            edit.apply()
        }

    fun isProvisioned(): Boolean = !deviceId.isNullOrBlank() && !readerSecret.isNullOrBlank()

    fun allowedModes(): List<String> = allowedModesCsv.split(',').map { it.trim() }.filter { it.isNotBlank() }

    fun clearDevice() {
        deviceId = null
        readerSecret = null
        plain.edit()
            .remove("allowedModes")
            .remove("locationLabel")
            .apply()
    }
}
