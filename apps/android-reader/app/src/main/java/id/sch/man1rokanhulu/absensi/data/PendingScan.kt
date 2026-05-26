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
    @Query("SELECT * FROM pending_scans ORDER BY createdAt ASC LIMIT 50")
    suspend fun list(): List<PendingScan>

    @Insert
    suspend fun insert(scan: PendingScan)

    @Query("DELETE FROM pending_scans WHERE id = :id")
    suspend fun delete(id: Long)

    @Query("DELETE FROM pending_scans")
    suspend fun clear()

    @Query("SELECT COUNT(*) FROM pending_scans")
    suspend fun count(): Int
}

@Database(entities = [PendingScan::class], version = 1, exportSchema = false)
abstract class PendingScanDatabase : RoomDatabase() {
    abstract fun pendingScans(): PendingScanDao
}
