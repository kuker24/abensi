package id.sch.man1rokanhulu.absensi.data

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase

@Entity(tableName = "pending_scans")
data class PendingScan(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val qrCodeMasked: String,
    val qrCodeEncrypted: String,
    val mode: String,
    val createdAt: Long,
    val attempts: Int = 0
)

@Dao
interface PendingScanDao {
    @Query("SELECT * FROM pending_scans WHERE attempts < :maxAttempts ORDER BY createdAt ASC LIMIT 50")
    suspend fun listReadyForSync(maxAttempts: Int): List<PendingScan>

    @Query("SELECT COUNT(*) FROM pending_scans WHERE attempts >= :maxAttempts")
    suspend fun countParked(maxAttempts: Int): Int

    @Insert
    suspend fun insert(scan: PendingScan)

    @Query("DELETE FROM pending_scans WHERE id = :id")
    suspend fun delete(id: Long)

    @Query("UPDATE pending_scans SET attempts = attempts + 1 WHERE id = :id AND attempts < :maxAttempts")
    suspend fun incrementAttemptsIfBelowMax(id: Long, maxAttempts: Int): Int

    @Query("DELETE FROM pending_scans")
    suspend fun clear()

    @Query("SELECT COUNT(*) FROM pending_scans")
    suspend fun count(): Int
}

@Database(entities = [PendingScan::class], version = 1, exportSchema = false)
abstract class PendingScanDatabase : RoomDatabase() {
    abstract fun pendingScans(): PendingScanDao
}
