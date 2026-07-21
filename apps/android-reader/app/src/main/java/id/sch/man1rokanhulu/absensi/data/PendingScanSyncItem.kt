package id.sch.man1rokanhulu.absensi.data

import id.sch.man1rokanhulu.absensi.network.MAX_PENDING_SCAN_ATTEMPTS
import id.sch.man1rokanhulu.absensi.security.QrParser

sealed interface PendingScanSyncItem {
    data class Ready(
        val id: Long,
        val mode: String,
        val createdAt: Long,
        val attempts: Int,
        val parsedQr: QrParser.Parsed
    ) : PendingScanSyncItem

    data class Malformed(
        val id: Long,
        val mode: String
    ) : PendingScanSyncItem

    data class Unexpected(
        val id: Long,
        val mode: String
    ) : PendingScanSyncItem
}

class PendingScanDecryptionException : Exception("Pending scan cannot be decrypted.")

fun selectReadyPendingScans(
    entries: List<PendingScan>,
    maxAttempts: Int = MAX_PENDING_SCAN_ATTEMPTS
): List<PendingScan> = entries.filter { it.attempts < maxAttempts }

fun mapPendingScansForSync(
    entries: List<PendingScan>,
    decrypt: (String) -> String
): List<PendingScanSyncItem> = entries.map { entry ->
    val malformed = {
        PendingScanSyncItem.Malformed(
            id = entry.id,
            mode = entry.mode
        )
    }
    val rawQr = try {
        decrypt(entry.qrCodeEncrypted)
    } catch (_: PendingScanDecryptionException) {
        return@map malformed()
    } catch (_: Exception) {
        return@map PendingScanSyncItem.Unexpected(entry.id, entry.mode)
    }
    val parsedQr = try {
        QrParser.parse(rawQr)
    } catch (_: IllegalArgumentException) {
        return@map malformed()
    }
    PendingScanSyncItem.Ready(
        id = entry.id,
        mode = entry.mode,
        createdAt = entry.createdAt,
        attempts = entry.attempts,
        parsedQr = parsedQr
    )
}
