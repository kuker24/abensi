package id.sch.man1rokanhulu.absensi.data

import android.content.Context
import androidx.room.Room
import id.sch.man1rokanhulu.absensi.network.MAX_PENDING_SCAN_ATTEMPTS
import id.sch.man1rokanhulu.absensi.security.LocalAes
import java.time.Instant

class OfflineQueueRepository(context: Context) : PendingScanRetryQueue {
    private val db = Room.databaseBuilder(context.applicationContext, PendingScanDatabase::class.java, "schoolhub-pending-scans.db").build()
    private val crypto = LocalAes()

    suspend fun enqueue(qrCode: String, mode: String, scannedAt: Instant = Instant.now()): Boolean {
        val count = db.pendingScans().count()
        if (count >= 100) return false
        db.pendingScans().insert(
            PendingScan(
                qrCodeMasked = maskQrForStorage(qrCode),
                qrCodeEncrypted = crypto.encrypt(qrCode),
                mode = mode,
                createdAt = scannedAt.toEpochMilli()
            )
        )
        return true
    }

    override suspend fun listForSync(): List<PendingScanSyncItem> = mapPendingScansForSync(
        db.pendingScans().listReadyForSync(MAX_PENDING_SCAN_ATTEMPTS)
    ) { encryptedQr ->
        decryptPendingQr(encryptedQr)
    }

    private fun decryptPendingQr(encryptedQr: String): String = try {
        crypto.decrypt(encryptedQr)
    } catch (error: IllegalArgumentException) {
        malformedPendingScan(error)
    } catch (error: IndexOutOfBoundsException) {
        malformedPendingScan(error)
    } catch (error: java.security.GeneralSecurityException) {
        malformedPendingScan(error)
    }

    private fun malformedPendingScan(error: Exception): Nothing =
        throw PendingScanDecryptionException().apply { initCause(error) }

    override suspend fun parkedCount(): Int = db.pendingScans().countParked(MAX_PENDING_SCAN_ATTEMPTS)
    override suspend fun delete(id: Long) = db.pendingScans().delete(id)
    override suspend fun incrementAttemptsIfBelowMax(id: Long, maxAttempts: Int): Boolean =
        db.pendingScans().incrementAttemptsIfBelowMax(id, maxAttempts) == 1
    suspend fun clear() = db.pendingScans().clear()
    suspend fun count(): Int = db.pendingScans().count()

    companion object {
        fun maskQrForStorage(qrCode: String): String = ScanHistoryStore.maskQr(qrCode)
    }
}
