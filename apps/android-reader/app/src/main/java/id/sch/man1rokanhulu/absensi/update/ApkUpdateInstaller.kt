package id.sch.man1rokanhulu.absensi.update

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import id.sch.man1rokanhulu.absensi.BuildConfig
import id.sch.man1rokanhulu.absensi.network.SchoolHubApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

object ApkUpdateInstaller {
    private val http = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    fun trustedDownloadUrl(baseUrl: String, downloadUrl: String?, releaseBuild: Boolean = !BuildConfig.DEBUG): String? {
        if (downloadUrl.isNullOrBlank()) return null
        val base = runCatching { java.net.URI(baseUrl.trim().removeSuffix("/")) }.getOrNull() ?: return null
        val candidate = runCatching {
            if (downloadUrl.startsWith("/")) java.net.URI("${base.scheme}://${base.authority}$downloadUrl") else java.net.URI(downloadUrl)
        }.getOrNull() ?: return null
        if (candidate.scheme == null || candidate.authority == null) return null
        if (releaseBuild && candidate.scheme != "https") return null
        if (!releaseBuild && candidate.scheme !in listOf("https", "http")) return null
        if (candidate.host != base.host) return null
        return candidate.toString()
    }

    suspend fun downloadAndVerify(context: Context, baseUrl: String, info: SchoolHubApiClient.VersionInfo): File = withContext(Dispatchers.IO) {
        val url = trustedDownloadUrl(baseUrl, info.downloadUrl) ?: throw IOException("Link download APK tidak valid atau tidak tepercaya.")
        val request = Request.Builder().url(url).get().header("accept", "application/vnd.android.package-archive").build()
        val response = http.newCall(request).execute()
        response.use {
            if (!it.isSuccessful) throw IOException("Download APK gagal HTTP ${it.code}")
            val body = it.body ?: throw IOException("Download APK kosong.")
            val directory = File(context.cacheDir, "updates").apply { mkdirs() }
            val output = File(directory, "schoolhub-reader-v${info.latestVersionCode}.apk")
            output.outputStream().use { stream -> body.byteStream().copyTo(stream) }
            if (info.apkSizeBytes != null && info.apkSizeBytes > 0 && output.length() != info.apkSizeBytes.toLong()) {
                output.delete()
                throw IOException("Ukuran APK tidak cocok. Download dibatalkan.")
            }
            val expected = info.apkSha256?.lowercase()?.takeIf { hash -> Regex("^[a-f0-9]{64}$").matches(hash) }
            if (expected != null && sha256(output) != expected) {
                output.delete()
                throw IOException("SHA256 APK tidak cocok. Install dibatalkan.")
            }
            output
        }
    }

    fun canRequestInstall(context: Context): Boolean = Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls()

    fun openUnknownAppSettings(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    fun openInstaller(context: Context, apk: File) {
        val uri = FileProvider.getUriForFile(context, "${BuildConfig.APPLICATION_ID}.fileprovider", apk)
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
                val read = input.read(buffer)
                if (read <= 0) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
}
