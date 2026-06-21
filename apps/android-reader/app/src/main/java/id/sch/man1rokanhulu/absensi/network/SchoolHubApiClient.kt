package id.sch.man1rokanhulu.absensi.network

import id.sch.man1rokanhulu.absensi.BuildConfig
import id.sch.man1rokanhulu.absensi.security.CanonicalJson
import id.sch.man1rokanhulu.absensi.security.Signer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.time.Instant
import java.util.concurrent.TimeUnit

class SchoolHubApiClient(private val baseUrlProvider: () -> String) {
    private val http = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()
    private val jsonType = "application/json; charset=utf-8".toMediaType()

    data class ProvisionResult(val deviceId: String, val readerId: String?, val readerSecret: String, val allowedModes: List<String>)
    data class ScanResult(val ok: Boolean, val message: String, val color: String, val body: String, val statusCode: Int? = null)
    data class ReaderStatusPayload(
        val pendingQueueCount: Int,
        val currentMode: String? = null,
        val lastQueueFlushAt: String? = null,
        val batteryLevel: Int? = null,
        val networkStatus: String? = null,
        val statusMessage: String? = null,
        val warnings: List<String> = emptyList()
    )
    data class VersionInfo(val latestVersionName: String, val latestVersionCode: Int, val minSupportedVersionCode: Int, val forceUpdate: Boolean, val releaseNotes: String?)

    private fun base(): String = baseUrlProvider().trim().removeSuffix("/")

    fun validateServerUrl(url: String, releaseBuild: Boolean = !BuildConfig.DEBUG): Boolean {
        val normalized = url.trim()
        if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) return false
        if (releaseBuild && !normalized.startsWith("https://")) return false
        return true
    }

    suspend fun health(): Boolean = withContext(Dispatchers.IO) {
        val request = Request.Builder().url("${base()}/api/v1/health/live").get().build()
        http.newCall(request).execute().use { it.isSuccessful }
    }

    suspend fun completeProvision(provisionToken: String, deviceId: String, deviceName: String): ProvisionResult = withContext(Dispatchers.IO) {
        val bodyMap = mapOf(
            "provisionToken" to provisionToken,
            "deviceId" to deviceId,
            "deviceName" to deviceName,
            "appVersion" to BuildConfig.VERSION_NAME,
            "appVersionCode" to BuildConfig.VERSION_CODE
        )
        val raw = CanonicalJson.stringify(bodyMap)
        val request = Request.Builder()
            .url("${base()}/api/v1/device-readers/android/provision/complete")
            .post(raw.toRequestBody(jsonType))
            .header("accept", "application/json")
            .build()
        http.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IOException(errorMessage(text, response.code))
            val obj = JSONObject(text)
            val modes = obj.optJSONArray("allowedModes")?.toList() ?: emptyList()
            ProvisionResult(obj.getString("deviceId"), obj.optString("readerId"), obj.getString("readerSecret"), modes)
        }
    }

    suspend fun sendReaderStatus(payload: ReaderStatusPayload, deviceId: String, secret: String): Boolean = withContext(Dispatchers.IO) {
        val bodyMap = mutableMapOf<String, Any?>(
            "pendingQueueCount" to payload.pendingQueueCount,
            "currentMode" to payload.currentMode,
            "lastQueueFlushAt" to payload.lastQueueFlushAt,
            "batteryLevel" to payload.batteryLevel,
            "networkStatus" to payload.networkStatus,
            "statusMessage" to payload.statusMessage,
            "appVersion" to BuildConfig.VERSION_NAME,
            "appVersionCode" to BuildConfig.VERSION_CODE
        )
        if (payload.warnings.isNotEmpty()) bodyMap["warnings"] = payload.warnings.take(10)
        val raw = CanonicalJson.stringify(bodyMap)
        val path = "/api/v1/device-readers/android/status"
        val headers = Signer.signedHeaders(deviceId, secret, "POST", path, raw)
        val requestBuilder = Request.Builder().url("${base()}$path").post(raw.toRequestBody(jsonType))
        headers.forEach { (key, value) -> requestBuilder.header(key, value) }
        http.newCall(requestBuilder.build()).execute().use { response -> response.isSuccessful }
    }

    suspend fun scanQr(qrCode: String, mode: String, deviceId: String, secret: String): ScanResult = withContext(Dispatchers.IO) {
        val bodyMap = mapOf(
            "credentialType" to "QR",
            "qrCode" to qrCode,
            "scanMode" to mode,
            "clientScannedAt" to Instant.now().toString(),
            "appVersion" to BuildConfig.VERSION_NAME,
            "appVersionCode" to BuildConfig.VERSION_CODE
        )
        val raw = CanonicalJson.stringify(bodyMap)
        val path = "/api/v1/attendance/qr-reader-scan"
        val headers = Signer.signedHeaders(deviceId, secret, "POST", path, raw)
        val requestBuilder = Request.Builder().url("${base()}$path").post(raw.toRequestBody(jsonType))
        headers.forEach { (key, value) -> requestBuilder.header(key, value) }
        http.newCall(requestBuilder.build()).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) return@withContext ScanResult(false, errorMessage(text, response.code), "red", text, response.code)
            val obj = JSONObject(text)
            ScanResult(true, obj.optString("message", "Scan diterima server."), "green", text, response.code)
        }
    }

    suspend fun version(): VersionInfo = withContext(Dispatchers.IO) {
        val request = Request.Builder().url("${base()}/api/v1/mobile/android-reader/version").get().header("accept", "application/json").build()
        http.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IOException(errorMessage(text, response.code))
            val obj = JSONObject(text)
            VersionInfo(obj.optString("latestVersionName"), obj.optInt("latestVersionCode"), obj.optInt("minSupportedVersionCode"), obj.optBoolean("forceUpdate"), obj.optString("releaseNotes"))
        }
    }

    private fun JSONArray.toList(): List<String> = (0 until length()).map { optString(it) }

    private fun errorMessage(text: String, code: Int): String {
        val parsed = runCatching {
            val obj = JSONObject(text)
            val message = obj.opt("message")
            when (message) {
                is JSONArray -> (0 until message.length()).joinToString(", ") { message.optString(it) }
                is String -> message
                else -> null
            }
        }.getOrNull()
        if (!parsed.isNullOrBlank()) return parsed

        val regexMessage = Regex("\"message\"\\s*:\\s*\"([^\"]+)\"").find(text)?.groupValues?.getOrNull(1)
        if (!regexMessage.isNullOrBlank()) return regexMessage

        return "HTTP $code"
    }
}
