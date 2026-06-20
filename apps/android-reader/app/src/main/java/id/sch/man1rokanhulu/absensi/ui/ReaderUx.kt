package id.sch.man1rokanhulu.absensi.ui

import java.time.LocalTime

const val DEFAULT_SIAB2_SERVER_URL = "https://absensi.man1rokanhulu.cloud"

enum class ReaderDeviceKind { GATE, MUSHOLA, CHECK_ONLY, MIXED }

private fun normalizeMode(mode: String): String = when (mode.trim().uppercase()) {
    "GATE_IN", "GATE_OUT" -> "GERBANG"
    else -> mode.trim().uppercase()
}

fun selectableScanModes(allowedModes: List<String>): List<String> {
    val normalized = allowedModes.map(::normalizeMode).toSet()
    val result = mutableListOf<String>()
    if (normalized.contains("GERBANG")) result.add("GERBANG")
    if (normalized.contains("MUSHOLA")) result.add("MUSHOLA")
    if (result.isEmpty() && normalized.contains("CHECK_ONLY")) result.add("CHECK_ONLY")
    return result.ifEmpty { listOf("GERBANG", "MUSHOLA") }
}

fun readerDeviceKind(allowedModes: List<String>): ReaderDeviceKind {
    val modes = selectableScanModes(allowedModes).toSet()
    val hasGate = modes.contains("GERBANG")
    val hasMushola = modes.contains("MUSHOLA")
    return when {
        hasGate && hasMushola -> ReaderDeviceKind.MIXED
        hasGate -> ReaderDeviceKind.GATE
        hasMushola -> ReaderDeviceKind.MUSHOLA
        modes.contains("CHECK_ONLY") -> ReaderDeviceKind.CHECK_ONLY
        else -> ReaderDeviceKind.MIXED
    }
}

fun readerDeviceTitle(allowedModes: List<String>): String = when (readerDeviceKind(allowedModes)) {
    ReaderDeviceKind.GATE, ReaderDeviceKind.MUSHOLA, ReaderDeviceKind.MIXED -> "HP Scanner"
    ReaderDeviceKind.CHECK_ONLY -> "Mode Cek QR"
}

fun readerModeSummary(allowedModes: List<String>): String = when (readerDeviceKind(allowedModes)) {
    ReaderDeviceKind.GATE -> "Mode Gerbang tersedia"
    ReaderDeviceKind.MUSHOLA -> "Mode Mushola tersedia"
    ReaderDeviceKind.CHECK_ONLY -> "Mode: Cek Saja"
    ReaderDeviceKind.MIXED -> "Pilih Mode Gerbang atau Mode Mushola"
}

fun effectiveScanMode(allowedModes: List<String>, currentMode: String): String {
    val modes = selectableScanModes(allowedModes)
    val normalizedCurrent = normalizeMode(currentMode)
    return when {
        modes.contains(normalizedCurrent) -> normalizedCurrent
        modes.contains("GERBANG") -> "GERBANG"
        modes.contains("MUSHOLA") -> "MUSHOLA"
        else -> modes.firstOrNull() ?: "GERBANG"
    }
}

fun showManualModePicker(allowedModes: List<String>): Boolean = selectableScanModes(allowedModes).size > 1

fun scanModeTitle(mode: String): String = when (normalizeMode(mode)) {
    "GERBANG" -> "Mode Gerbang"
    "MUSHOLA" -> "Mode Mushola"
    "CHECK_ONLY" -> "Mode Cek QR"
    else -> "Mode Scan"
}

fun scanModeHelper(mode: String): String = when (normalizeMode(mode)) {
    "GERBANG" -> "Scan datang/pulang."
    "MUSHOLA" -> "Scan sholat siswa."
    "CHECK_ONLY" -> "Cek QR tanpa mencatat presensi."
    else -> "Arahkan QR ke kamera."
}

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
        lower.contains("datang tercatat") -> "Datang tercatat"
        lower.contains("pulang tercatat") -> "Pulang tercatat"
        lower.contains("sholat tercatat") -> "Sholat tercatat"
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
private const val WRONG_MODE_MESSAGE = "QR tidak cocok untuk mode scan ini"
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
        text.contains("sholat", ignoreCase = true) && text.contains("tercatat", ignoreCase = true) -> "Sholat tercatat"
        isServerProblem(text) -> SERVER_PROBLEM_MESSAGE
        isAuthProblem(text) -> READER_ACCESS_MESSAGE
        isProvisionTokenProblem(text) -> ACTIVATION_TOKEN_MESSAGE
        status == 404 -> QR_REVOKED_MESSAGE
        text.contains("Mode scan", ignoreCase = true) || text.contains("Mode HP", ignoreCase = true) || text.contains("Mode Gerbang", ignoreCase = true) || text.contains("Mode Mushola", ignoreCase = true) || text.contains("Tipe reader", ignoreCase = true) || text.contains("tidak cocok", ignoreCase = true) -> WRONG_MODE_MESSAGE
        text.contains("QR", ignoreCase = true) && (text.contains("tidak", ignoreCase = true) || text.contains("dicabut", ignoreCase = true) || text.contains("invalid", ignoreCase = true)) -> QR_REVOKED_MESSAGE
        text.contains("Signature reader", ignoreCase = true) || text.contains("Reader tidak aktif", ignoreCase = true) || text.contains("dinonaktif", ignoreCase = true) || text.contains("dicabut", ignoreCase = true) -> READER_REVOKED_MESSAGE
        text.contains("mushola", ignoreCase = true) && text.contains("siswa", ignoreCase = true) -> WRONG_MODE_MESSAGE
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

fun shouldResetProvisioning(raw: String?, statusCode: Int? = null): Boolean {
    val text = raw?.lowercase().orEmpty()
    val identityMessage = text.contains("reader tidak aktif") ||
        text.contains("sudah dicabut") ||
        text.contains("dinonaktif") ||
        text.contains("hp scanner belum aktif") ||
        text.contains("tidak ditemukan") && text.contains("reader") ||
        text.contains("signature reader") ||
        text.contains("reader belum memiliki secret")

    if (identityMessage) return true
    if (statusCode == 401 && text.contains("signature")) return true
    if (statusCode == 403 && text.contains("reader") && !text.contains("mode")) return true

    return text.contains("http 401") || text.contains("http 403")
}
