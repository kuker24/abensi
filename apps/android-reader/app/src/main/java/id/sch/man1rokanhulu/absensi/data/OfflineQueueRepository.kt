package id.sch.man1rokanhulu.absensi.data

import android.content.Context
import androidx.room.Room
import id.sch.man1rokanhulu.absensi.security.LocalAes

class OfflineQueueRepository(context: Context) {
    private val db = Room.databaseBuilder(context.applicationContext, PendingScanDatabase::class.java, "schoolhub-pending-scans.db").build()
    private val crypto = LocalAes()

    suspend fun enqueue(qrCode: String, mode: String): Boolean {
        val count = db.pendingScans().count()
        if (count >= 100) return false
        db.pendingScans().insert(
            PendingScan(
                qrCodeMasked = maskQrForStorage(qrCode),
                qrCodeEncrypted = crypto.encrypt(qrCode),
                mode = mode,
                createdAt = System.currentTimeMillis()
            )
        )
        return true
    }

    suspend fun listForSync(): List<Pair<PendingScan, String>> = db.pendingScans().list().map { it to crypto.decrypt(it.qrCodeEncrypted) }
    suspend fun delete(id: Long) = db.pendingScans().delete(id)
    suspend fun clear() = db.pendingScans().clear()
    suspend fun count(): Int = db.pendingScans().count()

    companion object {
        fun maskQrForStorage(qrCode: String): String = ScanHistoryStore.maskQr(qrCode)
    }
}
