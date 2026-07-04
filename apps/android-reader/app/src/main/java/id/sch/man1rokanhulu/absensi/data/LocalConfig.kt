package id.sch.man1rokanhulu.absensi.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import id.sch.man1rokanhulu.absensi.BuildConfig
import java.io.File
import java.security.KeyStore
import java.util.UUID

class LocalConfig(private val context: Context) {
    private val plain = context.getSharedPreferences("schoolhub-reader-config", Context.MODE_PRIVATE)
    private val secure by lazy { openSecurePreferences(recovered = false) }

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
        get() = plain.getString("allowedModes", "GERBANG,MUSHOLA") ?: "GERBANG,MUSHOLA"
        set(value) = plain.edit().putString("allowedModes", value).apply()

    var lastScanMode: String
        get() = plain.getString("lastScanMode", "GERBANG") ?: "GERBANG"
        set(value) = plain.edit().putString("lastScanMode", value).apply()

    var lastQueueFlushAt: String?
        get() = plain.getString("lastQueueFlushAt", null)
        set(value) {
            val edit = plain.edit()
            if (value.isNullOrBlank()) edit.remove("lastQueueFlushAt") else edit.putString("lastQueueFlushAt", value)
            edit.apply()
        }

    var lastUpdateCheckAtMs: Long
        get() = plain.getLong("lastUpdateCheckAtMs", 0L)
        set(value) = plain.edit().putLong("lastUpdateCheckAtMs", value).apply()

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
        get() = runCatching { secure.getString("readerSecret", null) }.getOrNull()
        set(value) {
            val edit = secure.edit()
            if (value.isNullOrBlank()) edit.remove("readerSecret") else edit.putString("readerSecret", value)
            edit.apply()
        }

    fun isProvisioned(): Boolean = !deviceId.isNullOrBlank() && !readerSecret.isNullOrBlank()

    fun allowedModes(): List<String> = allowedModesCsv.split(',').map { it.trim() }.filter { it.isNotBlank() }

    fun clearDevice() {
        deviceId = null
        runCatching { readerSecret = null }
        plain.edit()
            .remove("allowedModes")
            .remove("locationLabel")
            .remove("lastQueueFlushAt")
            .apply()
    }

    private fun openSecurePreferences(recovered: Boolean): SharedPreferences {
        val key = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        return try {
            EncryptedSharedPreferences.create(
                context,
                "schoolhub-reader-secure",
                key,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (error: Exception) {
            if (recovered) throw error
            resetSecurePreferences()
            openSecurePreferences(recovered = true)
        }
    }

    private fun resetSecurePreferences() {
        runCatching { context.deleteSharedPreferences("schoolhub-reader-secure") }
        runCatching { context.deleteSharedPreferences("__androidx_security_crypto_encrypted_prefs_key_keyset__") }
        runCatching { context.deleteSharedPreferences("__androidx_security_crypto_encrypted_prefs_value_keyset__") }
        runCatching { File(context.applicationInfo.dataDir, "shared_prefs/schoolhub-reader-secure.xml").delete() }
        runCatching { File(context.applicationInfo.dataDir, "shared_prefs/__androidx_security_crypto_encrypted_prefs_key_keyset__.xml").delete() }
        runCatching { File(context.applicationInfo.dataDir, "shared_prefs/__androidx_security_crypto_encrypted_prefs_value_keyset__.xml").delete() }
        runCatching {
            KeyStore.getInstance("AndroidKeyStore").apply {
                load(null)
                deleteEntry("_androidx_security_master_key_")
            }
        }
        plain.edit()
            .remove("deviceId")
            .remove("allowedModes")
            .remove("locationLabel")
            .remove("lastQueueFlushAt")
            .apply()
    }
}
