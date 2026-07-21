package id.sch.man1rokanhulu.absensi.data

import id.sch.man1rokanhulu.absensi.network.MAX_PENDING_SCAN_ATTEMPTS
import id.sch.man1rokanhulu.absensi.network.isRetryableScanStatus
import id.sch.man1rokanhulu.absensi.network.reachesPendingScanAttemptLimit
import kotlinx.coroutines.CancellationException
import java.io.IOException
import java.time.Instant

data class PendingScanRetryResult(
    val sent: Int,
    val rejected: Int,
    val pending: Int,
    val parked: Int
)

data class PendingScanRetryResponse(
    val ok: Boolean,
    val message: String,
    val statusCode: Int?
)

enum class PendingScanRetryHistoryStatus { SENT, REJECTED }

data class PendingScanRetryHistoryEvent(
    val mode: String,
    val status: PendingScanRetryHistoryStatus,
    val opaqueCode: String,
    val message: String
)

interface PendingScanRetryQueue {
    suspend fun listForSync(): List<PendingScanSyncItem>
    suspend fun delete(id: Long)
    suspend fun incrementAttemptsIfBelowMax(id: Long, maxAttempts: Int): Boolean
    suspend fun parkedCount(): Int
}

/**
 * Coordinates one bounded offline-queue flush without receiving raw stored QR ciphertext.
 * Queue persistence supplies only parsed, validated QR data in [PendingScanSyncItem.Ready].
 */
class PendingScanRetryOrchestrator(
    private val queue: PendingScanRetryQueue,
    private val credentialsAvailable: () -> Boolean,
    private val send: suspend (PendingScanSyncItem.Ready, Instant) -> PendingScanRetryResponse,
    private val recordHistory: suspend (PendingScanRetryHistoryEvent) -> Unit,
    private val sanitizeMessage: (String?, String) -> String
) {
    suspend fun flush(): PendingScanRetryResult {
        var sent = 0
        var rejected = 0
        var pending = 0

        for (item in queue.listForSync()) {
            when (item) {
                is PendingScanSyncItem.Malformed -> {
                    if (recordRejected(item.mode, "", "Antrean rusak dihapus. Scan ulang QR.")) {
                        queue.delete(item.id)
                        rejected++
                    } else {
                        break
                    }
                }

                is PendingScanSyncItem.Unexpected -> {
                    recordRejected(item.mode, "", "Antrean belum bisa diproses. Hubungi operator IT.")
                    break
                }

                is PendingScanSyncItem.Ready -> {
                    if (!credentialsAvailable()) {
                        pending++
                        break
                    }
                    val response = try {
                        send(item, Instant.ofEpochMilli(item.createdAt))
                    } catch (_: IOException) {
                        val retry = retainRetryable(item)
                        pending += retry.pending
                        if (!retry.parked) break
                        continue
                    } catch (_: Exception) {
                        recordRejected(item.mode, "", "Antrean belum bisa diproses. Hubungi operator IT.")
                        break
                    }

                    if (response.ok) {
                        val historySaved = recordHistorySafely(
                            PendingScanRetryHistoryEvent(
                                mode = item.mode,
                                status = PendingScanRetryHistoryStatus.SENT,
                                opaqueCode = item.parsedQr.opaqueCode,
                                message = sanitizeMessage(response.message, "Antrean terkirim.")
                            )
                        )
                        if (!historySaved) break
                        queue.delete(item.id)
                        sent++
                    } else if (isRetryableScanStatus(response.statusCode)) {
                        val retry = retainRetryable(item)
                        pending += retry.pending
                        if (!retry.parked) break
                    } else {
                        if (recordRejected(
                                item.mode,
                                item.parsedQr.opaqueCode,
                                sanitizeMessage(response.message, "Ditolak server saat kirim ulang.")
                            )
                        ) {
                            queue.delete(item.id)
                            rejected++
                        } else {
                            break
                        }
                    }
                }
            }
        }

        return PendingScanRetryResult(
            sent = sent,
            rejected = rejected,
            pending = pending,
            parked = queue.parkedCount()
        )
    }

    private suspend fun retainRetryable(item: PendingScanSyncItem.Ready): RetryDecision {
        val incremented = queue.incrementAttemptsIfBelowMax(item.id, MAX_PENDING_SCAN_ATTEMPTS)
        return RetryDecision(
            pending = 1,
            parked = !incremented || reachesPendingScanAttemptLimit(item.attempts)
        )
    }

    private suspend fun recordRejected(mode: String, opaqueCode: String, message: String): Boolean =
        recordHistorySafely(
            PendingScanRetryHistoryEvent(
                mode = mode,
                status = PendingScanRetryHistoryStatus.REJECTED,
                opaqueCode = opaqueCode,
                message = message
            )
        )

    private suspend fun recordHistorySafely(event: PendingScanRetryHistoryEvent): Boolean = try {
        recordHistory(event)
        true
    } catch (error: Throwable) {
        if (error is CancellationException) throw error
        false
    }

    private data class RetryDecision(val pending: Int, val parked: Boolean)
}
