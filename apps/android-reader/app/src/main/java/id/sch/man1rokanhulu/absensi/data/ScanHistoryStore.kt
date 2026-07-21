package id.sch.man1rokanhulu.absensi.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

enum class ScanHistoryStatus {
    SENT,
    QUEUED,
    REJECTED
}

data class ScanHistoryEntry(
    val timestamp: Long,
    val mode: String,
    val status: ScanHistoryStatus,
    val maskedCode: String,
    val message: String,
    val displayName: String? = null,
    val displayMeta: String? = null,
    val actionLabel: String? = null
)

/**
 * Menyimpan ringkasan riwayat scan terakhir untuk ditampilkan ke operator.
 *
 * Yang DISIMPAN:
 *  - waktu scan, mode, status, 4 karakter terakhir kode QR (untuk identifikasi visual),
 *    pesan dari server.
 *
 * Yang TIDAK DISIMPAN:
 *  - kode QR penuh, reader secret, signature, nonce, body request — agar APK tidak
 *    pernah membocorkan data sensitif walaupun perangkat hilang/diserahkan.
 */
class ScanHistoryStore(context: Context) {
    private val prefs = context.getSharedPreferences("schoolhub-scan-history", Context.MODE_PRIVATE)
    private val writeMutex = Mutex()

    fun list(): List<ScanHistoryEntry> {
        val raw = prefs.getString(KEY, null) ?: return emptyList()
        return fromStorageJson(raw)
    }

    /**
     * Persists masked history before callers delete their source queue row.
     * [commit] makes successful return a durable-write acknowledgement.
     */
    suspend fun add(entry: ScanHistoryEntry) = writeMutex.withLock {
        withContext(Dispatchers.IO) {
            val current = list().toMutableList()
            current.add(0, entry)
            while (current.size > MAX_ENTRIES) current.removeAt(current.lastIndex)
            check(save(current)) { "Riwayat scan tidak tersimpan." }
        }
    }

    fun clear() {
        prefs.edit().remove(KEY).apply()
    }

    private fun save(entries: List<ScanHistoryEntry>): Boolean =
        prefs.edit().putString(KEY, toStorageJson(entries)).commit()

    companion object {
        private const val KEY = "history_v1"
        const val MAX_ENTRIES = 20

        fun maskQr(rawQr: String): String {
            val tail = rawQr.takeLast(4).ifBlank { "????" }
            return "•••• $tail"
        }

        fun toStorageJson(entries: List<ScanHistoryEntry>): String = entries.joinToString(prefix = "[", postfix = "]") { entry ->
            "{" + listOf(
                "\"ts\":${entry.timestamp}",
                "\"mode\":${jsonString(entry.mode)}",
                "\"status\":${jsonString(entry.status.name)}",
                "\"masked\":${jsonString(entry.maskedCode)}",
                "\"message\":${jsonString(entry.message)}"
            ).joinToString(",") + "}"
        }

        private fun jsonString(value: String): String = buildString {
            append('"')
            value.forEach { char ->
                when (char) {
                    '\\' -> append("\\\\")
                    '"' -> append("\\\"")
                    '\n' -> append("\\n")
                    '\r' -> append("\\r")
                    '\t' -> append("\\t")
                    else -> append(char)
                }
            }
            append('"')
        }

        fun fromStorageJson(raw: String): List<ScanHistoryEntry> = runCatching {
            parseObjects(raw).map { obj ->
                ScanHistoryEntry(
                    timestamp = longField(obj, "ts") ?: 0L,
                    mode = stringField(obj, "mode").orEmpty(),
                    status = runCatching { ScanHistoryStatus.valueOf(stringField(obj, "status") ?: "QUEUED") }.getOrDefault(ScanHistoryStatus.QUEUED),
                    maskedCode = stringField(obj, "masked").orEmpty(),
                    message = stringField(obj, "message").orEmpty()
                )
            }
        }.getOrDefault(emptyList())

        private fun parseObjects(raw: String): List<String> {
            val trimmed = raw.trim().removePrefix("[").removeSuffix("]").trim()
            if (trimmed.isBlank()) return emptyList()
            val objects = mutableListOf<String>()
            var depth = 0
            var start = -1
            trimmed.forEachIndexed { index, char ->
                if (char == '{') {
                    if (depth == 0) start = index
                    depth += 1
                } else if (char == '}') {
                    depth -= 1
                    if (depth == 0 && start >= 0) objects.add(trimmed.substring(start, index + 1))
                }
            }
            return objects
        }

        private fun stringField(obj: String, name: String): String? = Regex("\"$name\"\\s*:\\s*\"((?:\\\\.|[^\"])*)\"").find(obj)?.groupValues?.getOrNull(1)?.let(::unescapeJsonString)

        private fun longField(obj: String, name: String): Long? = Regex("\"$name\"\\s*:\\s*(-?\\d+)").find(obj)?.groupValues?.getOrNull(1)?.toLongOrNull()

        private fun unescapeJsonString(value: String): String = buildString {
            var escaping = false
            value.forEach { char ->
                if (escaping) {
                    append(
                        when (char) {
                            'n' -> '\n'
                            'r' -> '\r'
                            't' -> '\t'
                            else -> char
                        }
                    )
                    escaping = false
                } else if (char == '\\') {
                    escaping = true
                } else {
                    append(char)
                }
            }
        }

        fun entry(mode: String, status: ScanHistoryStatus, opaqueCode: String, message: String): ScanHistoryEntry = ScanHistoryEntry(
            timestamp = System.currentTimeMillis(),
            mode = mode,
            status = status,
            maskedCode = maskQr(opaqueCode),
            message = message
        )
    }
}
