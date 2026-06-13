package id.sch.man1rokanhulu.absensi.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

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
    val message: String
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

    fun list(): List<ScanHistoryEntry> {
        val raw = prefs.getString(KEY, null) ?: return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            (0 until array.length()).map { i ->
                val obj = array.getJSONObject(i)
                ScanHistoryEntry(
                    timestamp = obj.optLong("ts"),
                    mode = obj.optString("mode"),
                    status = runCatching { ScanHistoryStatus.valueOf(obj.optString("status", "QUEUED")) }.getOrDefault(ScanHistoryStatus.QUEUED),
                    maskedCode = obj.optString("masked"),
                    message = obj.optString("message")
                )
            }
        }.getOrDefault(emptyList())
    }

    fun add(entry: ScanHistoryEntry) {
        val current = list().toMutableList()
        current.add(0, entry)
        while (current.size > MAX_ENTRIES) current.removeAt(current.lastIndex)
        save(current)
    }

    fun clear() {
        prefs.edit().remove(KEY).apply()
    }

    private fun save(entries: List<ScanHistoryEntry>) {
        val array = JSONArray()
        entries.forEach { entry ->
            val obj = JSONObject()
            obj.put("ts", entry.timestamp)
            obj.put("mode", entry.mode)
            obj.put("status", entry.status.name)
            obj.put("masked", entry.maskedCode)
            obj.put("message", entry.message)
            array.put(obj)
        }
        prefs.edit().putString(KEY, array.toString()).apply()
    }

    companion object {
        private const val KEY = "history_v1"
        const val MAX_ENTRIES = 20

        fun maskQr(rawQr: String): String {
            val tail = rawQr.takeLast(4).ifBlank { "????" }
            return "•••• $tail"
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
