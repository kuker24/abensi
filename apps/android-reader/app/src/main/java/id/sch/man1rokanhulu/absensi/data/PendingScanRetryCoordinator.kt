package id.sch.man1rokanhulu.absensi.data

import kotlinx.coroutines.sync.Mutex

/**
 * Owns the app-scoped retry-flush lock. A second trigger while a flush is
 * active is deliberately ignored so one queued scan cannot be sent twice.
 */
class PendingScanRetryCoordinator {
    private val flushMutex = Mutex()

    suspend fun <T> runIfIdle(block: suspend () -> T): T? {
        if (!flushMutex.tryLock()) return null
        return try {
            block()
        } finally {
            flushMutex.unlock()
        }
    }
}
