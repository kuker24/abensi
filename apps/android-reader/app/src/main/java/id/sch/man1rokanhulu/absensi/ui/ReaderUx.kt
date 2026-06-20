package id.sch.man1rokanhulu.absensi.ui

import java.time.LocalTime

const val DEFAULT_SIAB2_SERVER_URL = "https://absensi.man1rokanhulu.cloud"

enum class ReaderDeviceKind { GATE, MUSHOLA, CHECK_ONLY, MIXED }

fun readerDeviceKind(allowedModes: List<String>): ReaderDeviceKind {
    val modes = allowedModes.map { it.trim().uppercase() }.toSet()
    val hasGate = modes.contains("GATE_IN") || modes.contains("GATE_OUT")
    val hasMushola = modes.contains("MUSHOLA")
    return when {
        hasGate -> ReaderDeviceKind.GATE
        hasMushola -> ReaderDeviceKind.MUSHOLA
        modes.contains("CHECK_ONLY") -> ReaderDeviceKind.CHECK_ONLY
        else -> ReaderDeviceKind.MIXED
    }
}

fun readerDeviceTitle(allowedModes: List<String>): String = when (readerDeviceKind(allowedModes)) {
    ReaderDeviceKind.GATE -> "HP Gerbang"
    ReaderDeviceKind.MUSHOLA -> "HP Mushola"
    ReaderDeviceKind.CHECK_ONLY -> "Mode Cek QR"
    ReaderDeviceKind.MIXED -> "HP Scanner"
}

fun readerModeSummary(allowedModes: List<String>): String = when (readerDeviceKind(allowedModes)) {
    ReaderDeviceKind.GATE -> "Mode: Datang & Pulang"
    ReaderDeviceKind.MUSHOLA -> "Sholat saat ini: ${currentPrayerLabel()}"
    ReaderDeviceKind.CHECK_ONLY -> "Mode: Cek Saja"
    ReaderDeviceKind.MIXED -> "Mode scanner aktif"
}

fun effectiveScanMode(allowedModes: List<String>, currentMode: String): String {
    val modes = allowedModes.map { it.trim().uppercase() }.filter { it.isNotBlank() }
    val kind = readerDeviceKind(modes)
    return when (kind) {
        ReaderDeviceKind.GATE -> "GATE_IN" // server auto-maps first scan to Datang and later valid scan to Pulang when both modes are allowed.
        ReaderDeviceKind.MUSHOLA -> "MUSHOLA"
        ReaderDeviceKind.CHECK_ONLY -> "CHECK_ONLY"
        ReaderDeviceKind.MIXED -> if (modes.contains(currentMode.uppercase())) currentMode.uppercase() else modes.firstOrNull() ?: "CHECK_ONLY"
    }
}

fun showManualModePicker(allowedModes: List<String>): Boolean = readerDeviceKind(allowedModes) == ReaderDeviceKind.MIXED

fun currentPrayerLabel(now: LocalTime = LocalTime.now()): String = when {
    now.isBefore(LocalTime.of(10, 31)) -> "Dhuha"
    now.isBefore(LocalTime.of(13, 31)) -> "Dzuhur"
    now.isBefore(LocalTime.of(16, 31)) -> "Ashar"
    else -> "Di luar jadwal"
}

fun friendlyScanTitle(ok: Boolean, message: String): String {
    val lower = message.lowercase()
    return when {
        lower.contains("sudah tercatat") || lower.contains("sudah ada") -> "Sudah tercatat"
        ok -> "Berhasil tercatat"
        lower.contains("server") || lower.contains("internet") || lower.contains("wifi") -> "Server belum bisa dihubungi"
        else -> "Scan ditolak"
    }
}

private const val SERVER_PROBLEM_MESSAGE = "Server sedang bermasalah. Coba lagi sebentar atau hubungi operator IT."
private const val NETWORK_PROBLEM_MESSAGE = "Server belum bisa dihubungi. Periksa Wi-Fi atau internet HP."
private const val READER_REVOKED_MESSAGE = "HP scanner belum aktif atau dicabut. Minta admin aktivasi ulang."
private const val READER_ACCESS_MESSAGE = "HP scanner belum aktif atau dicabut. Minta admin aktivasi ulang."
private const val ACTIVATION_TOKEN_MESSAGE = "Kode aktivasi salah atau sudah kedaluwarsa. Minta admin membuat kode baru."
private const val WRONG_MODE_MESSAGE = "QR tidak cocok untuk HP ini"
private const val QR_REVOKED_MESSAGE = "QR tidak dikenal atau sudah dicabut."

private fun httpStatusCode(text: String): Int? = Regex("\\bHTTP\\s+(\\d{3})\\b", RegexOption.IGNORE_CASE).find(text)?.groupValues?.getOrNull(1)?.toIntOrNull()
private fun isServerProblem(text: String): Boolean = httpStatusCode(text)?.let { it >= 500 } == true || text.contains("server error", ignoreCase = true)
private fun isAuthProblem(text: String): Boolean = httpStatusCode(text) == 401 || httpStatusCode(text) == 403
private fun isNetworkProblem(text: String): Boolean = listOf("network", "unable to resolve", "unknownhost", "timeout", "failed to connect", "connection refused", "okhttp", "retrofit").any { text.contains(it, ignoreCase = true) }
private fun isProvisionTokenProblem(text: String): Boolean =
    text.contains("token provisioning", ignoreCase = true) ||
        text.contains("provisioning token", ignoreCase = true) ||
        text.contains("invalid token", ignoreCase = true) ||
        text.contains("expired", ignoreCase = true) ||
        text.contains("kedaluwarsa", ignoreCase = true)

fun friendlyActivationMessage(raw: String?): String {
    val text = raw?.trim().orEmpty()
    if (text.isBlank()) return "Aktivasi gagal. Coba lagi atau hubungi operator IT."
    val status = httpStatusCode(text)
    return when {
        isServerProblem(text) -> SERVER_PROBLEM_MESSAGE
        status == 401 || status == 403 -> READER_REVOKED_MESSAGE
        status == 404 -> "Kode aktivasi tidak ditemukan. Minta admin membuat kode baru."
        isProvisionTokenProblem(text) -> ACTIVATION_TOKEN_MESSAGE
        text.contains("Batas HP scanner aktif", ignoreCase = true) -> "Batas HP scanner aktif sudah penuh. Cabut salah satu HP dulu untuk mengganti perangkat."
        isNetworkProblem(text) -> NETWORK_PROBLEM_MESSAGE
        text.contains("Format", ignoreCase = true) || text.contains("Alamat server", ignoreCase = true) -> "Alamat server belum sesuai. Periksa Pengaturan Lanjutan."
        else -> "Aktivasi gagal. Coba lagi atau minta admin membuat kode baru."
    }
}

fun friendlyScanMessage(raw: String?): String {
    val text = raw?.trim().orEmpty()
    if (text.isBlank()) return "Scan belum bisa diproses. Coba lagi."
    val status = httpStatusCode(text)
    return when {
        text.contains("sudah tercatat", ignoreCase = true) || text.contains("sudah ada", ignoreCase = true) -> "Sudah tercatat"
        text.contains("datang", ignoreCase = true) && text.contains("tercatat", ignoreCase = true) -> "Datang tercatat"
        text.contains("pulang", ignoreCase = true) && text.contains("tercatat", ignoreCase = true) -> "Pulang tercatat"
        isServerProblem(text) -> SERVER_PROBLEM_MESSAGE
        isAuthProblem(text) -> READER_ACCESS_MESSAGE
        isProvisionTokenProblem(text) -> ACTIVATION_TOKEN_MESSAGE
        status == 404 -> QR_REVOKED_MESSAGE
        text.contains("Mode scan", ignoreCase = true) || text.contains("Mode HP", ignoreCase = true) || text.contains("Tipe reader", ignoreCase = true) || text.contains("tidak cocok", ignoreCase = true) -> WRONG_MODE_MESSAGE
        text.contains("QR", ignoreCase = true) && (text.contains("tidak", ignoreCase = true) || text.contains("dicabut", ignoreCase = true) || text.contains("invalid", ignoreCase = true)) -> QR_REVOKED_MESSAGE
        text.contains("Reader tidak aktif", ignoreCase = true) || text.contains("dinonaktif", ignoreCase = true) || text.contains("dicabut", ignoreCase = true) -> READER_REVOKED_MESSAGE
        text.contains("mushola", ignoreCase = true) && text.contains("siswa", ignoreCase = true) -> "HP Mushola hanya untuk scan siswa."
        text.contains("luar", ignoreCase = true) && text.contains("jadwal", ignoreCase = true) -> "Di luar jadwal scan. Coba lagi pada jadwal yang benar."
        isNetworkProblem(text) -> NETWORK_PROBLEM_MESSAGE
        text.contains("tercatat", ignoreCase = true) || text.contains("scan diterima", ignoreCase = true) -> text
        else -> "Scan belum bisa diproses. Coba lagi atau hubungi operator IT."
    }
}

fun safeScanHistoryMessage(raw: String?, fallback: String): String {
    val text = raw?.trim().orEmpty()
    if (text.isBlank()) return fallback
    return friendlyScanMessage(text)
}

fun shouldResetProvisioning(raw: String?): Boolean {
    val text = raw?.lowercase().orEmpty()
    return text.contains("reader tidak aktif") ||
        text.contains("sudah dicabut") ||
        text.contains("dinonaktif") ||
        text.contains("hp scanner belum aktif") ||
        text.contains("http 401") ||
        text.contains("http 403")
}
