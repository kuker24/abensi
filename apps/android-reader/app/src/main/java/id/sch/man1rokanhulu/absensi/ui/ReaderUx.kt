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

fun friendlyScanMessage(raw: String?): String {
    val text = raw?.trim().orEmpty()
    if (text.isBlank()) return "Scan belum bisa diproses. Coba lagi."
    return when {
        text.contains("Reader tidak aktif", ignoreCase = true) || text.contains("dicabut", ignoreCase = true) -> "HP scanner belum aktif. Minta admin aktivasi ulang."
        text.contains("Mode scan", ignoreCase = true) || text.contains("Mode HP", ignoreCase = true) || text.contains("Tipe reader", ignoreCase = true) -> "Mode HP ini tidak cocok untuk scan ini."
        text.contains("QR", ignoreCase = true) && (text.contains("tidak", ignoreCase = true) || text.contains("dicabut", ignoreCase = true)) -> "QR tidak dikenal atau sudah dicabut."
        text.contains("Unable to resolve", ignoreCase = true) || text.contains("timeout", ignoreCase = true) || text.contains("failed to connect", ignoreCase = true) -> "Server belum bisa dihubungi. Periksa Wi-Fi."
        else -> text
    }
}

fun shouldResetProvisioning(raw: String?): Boolean {
    val text = raw?.lowercase().orEmpty()
    return text.contains("reader tidak aktif") || text.contains("sudah dicabut") || text.contains("hp scanner belum aktif")
}
