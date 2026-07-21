package id.sch.man1rokanhulu.absensi

import id.sch.man1rokanhulu.absensi.data.PendingScanRetryCoordinator
import id.sch.man1rokanhulu.absensi.data.PendingScanRetryHistoryEvent
import id.sch.man1rokanhulu.absensi.data.PendingScanRetryHistoryStatus
import id.sch.man1rokanhulu.absensi.data.PendingScanRetryOrchestrator
import id.sch.man1rokanhulu.absensi.data.PendingScanRetryQueue
import id.sch.man1rokanhulu.absensi.data.PendingScanRetryResponse
import id.sch.man1rokanhulu.absensi.data.PendingScanSyncItem
import id.sch.man1rokanhulu.absensi.network.MAX_PENDING_SCAN_ATTEMPTS
import id.sch.man1rokanhulu.absensi.security.QrParser
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.time.Instant

private fun pendingScanId(item: PendingScanSyncItem): Long = when (item) {
    is PendingScanSyncItem.Ready -> item.id
    is PendingScanSyncItem.Malformed -> item.id
    is PendingScanSyncItem.Unexpected -> item.id
}

class PendingScanRetryOrchestratorTest {
    @Test
    fun finalRetryAtomicallyParksOldestAndLaterEligibleRowStillSends() = runTest {
        val queue = FakeQueue(
            ready(id = 1, createdAt = 1_000, attempts = MAX_PENDING_SCAN_ATTEMPTS - 1),
            ready(id = 2, createdAt = 2_000)
        )
        val sentIds = mutableListOf<Long>()

        val result = flush(queue, send = { item, _ ->
            sentIds += item.id
            if (item.id == 1L) response(statusCode = 429) else response(ok = true)
        })

        assertEquals(listOf(1L, 2L), sentIds)
        assertEquals(MAX_PENDING_SCAN_ATTEMPTS, queue.attemptsFor(1))
        assertTrue(queue.isPresent(1))
        assertFalse(queue.isPresent(2))
        assertEquals(1, result.sent)
        assertEquals(1, result.pending)
        assertEquals(1, result.parked)
        assertEquals(1, queue.operations.count { it == "increment:1" })
    }

    @Test
    fun retryableHttpAndIOExceptionIncrementAndKeepRowsQueued() = runTest {
        listOf(429, 503).forEach { status ->
            val queue = FakeQueue(ready(id = status.toLong(), createdAt = 1_000))

            val result = flush(queue, send = { _, _ -> response(statusCode = status) })

            assertTrue(queue.isPresent(status.toLong()))
            assertEquals(1, queue.attemptsFor(status.toLong()))
            assertEquals(1, result.pending)
            assertEquals(0, result.rejected)
        }

        val queue = FakeQueue(ready(id = 9, createdAt = 1_000))
        val result = flush(queue, send = { _, _ -> throw IOException("network unavailable") })

        assertTrue(queue.isPresent(9))
        assertEquals(1, queue.attemptsFor(9))
        assertEquals(1, result.pending)
        assertEquals(0, result.rejected)
    }

    @Test
    fun terminalResponseRecordsSanitizedHistoryBeforeDeleting() = runTest {
        val queue = FakeQueue(ready(id = 1, createdAt = 1_000))
        val events = mutableListOf<PendingScanRetryHistoryEvent>()

        val result = flush(
            queue,
            events = events,
            send = { _, _ -> response(statusCode = 422, message = "raw-qr-must-not-persist") }
        )

        assertFalse(queue.isPresent(1))
        assertEquals(1, result.rejected)
        assertEquals(listOf(PendingScanRetryHistoryStatus.REJECTED), events.map(PendingScanRetryHistoryEvent::status))
        assertFalse(events.single().message.contains("raw-qr-must-not-persist"))
        assertEquals("QR_ABCDEFGHIJ", events.single().opaqueCode)
        assertTrue(queue.operations.indexOf("history") < queue.operations.indexOf("delete:1"))
    }

    @Test
    fun malformedRowDeletesWithSanitizedHistoryAndHealthyNextRowContinues() = runTest {
        val queue = FakeQueue(
            PendingScanSyncItem.Malformed(id = 1, mode = "GERBANG"),
            ready(id = 2, createdAt = 2_000)
        )
        val events = mutableListOf<PendingScanRetryHistoryEvent>()

        val result = flush(queue, events = events, send = { _, _ -> response(ok = true) })

        assertFalse(queue.isPresent(1))
        assertFalse(queue.isPresent(2))
        assertEquals(1, result.rejected)
        assertEquals(1, result.sent)
        assertEquals("", events.first().opaqueCode)
        assertFalse(events.first().message.contains("ciphertext"))
        assertTrue(queue.operations.indexOf("history") < queue.operations.indexOf("delete:1"))
    }

    @Test
    fun originalCreatedAtBecomesClientScannedAt() = runTest {
        val createdAt = 1_721_234_567_890L
        val queue = FakeQueue(ready(id = 1, createdAt = createdAt))
        var clientScannedAt: Instant? = null

        flush(queue, send = { _, sentAt ->
            clientScannedAt = sentAt
            response(ok = true)
        })

        assertEquals(Instant.ofEpochMilli(createdAt), clientScannedAt)
    }

    @Test
    fun historyFailureKeepsSuccessfulResponseRowForSafeRetry() = runTest {
        val queue = FakeQueue(ready(id = 1, createdAt = 1_000))

        val result = flush(
            queue = queue,
            send = { _, _ -> response(ok = true) },
            recordHistory = { throw IOException("history unavailable") }
        )

        assertTrue(queue.isPresent(1))
        assertEquals(0, result.sent)
        assertFalse(queue.operations.contains("delete:1"))
    }

    @Test
    fun historyFailureKeepsMalformedRowInsteadOfDeletingWithoutAudit() = runTest {
        val queue = FakeQueue(PendingScanSyncItem.Malformed(id = 1, mode = "GERBANG"))

        val result = flush(
            queue = queue,
            send = { _, _ -> response(ok = true) },
            recordHistory = { throw IOException("history unavailable") }
        )

        assertTrue(queue.isPresent(1))
        assertEquals(0, result.rejected)
        assertFalse(queue.operations.contains("delete:1"))
    }

    @Test
    fun concurrentFlushesProcessQueueOnlyOnce() = runTest {
        val queue = FakeQueue(ready(id = 1, createdAt = 1_000))
        val coordinator = PendingScanRetryCoordinator()
        val sendStarted = CompletableDeferred<Unit>()
        val finishSend = CompletableDeferred<Unit>()
        var sendCount = 0

        val first = async {
            coordinator.runIfIdle {
                flush(queue, send = { _, _ ->
                    sendCount += 1
                    sendStarted.complete(Unit)
                    finishSend.await()
                    response(ok = true)
                })
            }
        }
        sendStarted.await()

        val second = async {
            coordinator.runIfIdle {
                flush(queue, send = { _, _ ->
                    sendCount += 1
                    response(ok = true)
                })
            }
        }

        assertNull(second.await())
        finishSend.complete(Unit)
        assertEquals(1, first.await()?.sent)
        assertEquals(1, sendCount)
        assertEquals(1, queue.operations.count { it == "delete:1" })
        assertEquals(1, queue.operations.count { it == "history" })
    }

    private suspend fun flush(
        queue: FakeQueue,
        events: MutableList<PendingScanRetryHistoryEvent> = mutableListOf(),
        send: suspend (PendingScanSyncItem.Ready, Instant) -> PendingScanRetryResponse,
        recordHistory: suspend (PendingScanRetryHistoryEvent) -> Unit = { event ->
            queue.operations += "history"
            events += event
        }
    ) = PendingScanRetryOrchestrator(
        queue = queue,
        credentialsAvailable = { true },
        send = send,
        recordHistory = recordHistory,
        sanitizeMessage = { _, fallback -> fallback }
    ).flush()

    private fun ready(id: Long, createdAt: Long, attempts: Int = 0) = PendingScanSyncItem.Ready(
        id = id,
        mode = "GERBANG",
        createdAt = createdAt,
        attempts = attempts,
        parsedQr = QrParser.parse("schoolhub:qr:v1:QR_ABCDEFGHIJ")
    )

    private fun response(
        ok: Boolean = false,
        message: String = "scan response",
        statusCode: Int? = 200
    ) = PendingScanRetryResponse(ok, message, statusCode)

    private class FakeQueue(vararg initial: PendingScanSyncItem) : PendingScanRetryQueue {
        private val rows = initial.associateBy(::pendingScanId).toMutableMap()
        private val attempts = initial.associate { pendingScanId(it) to ((it as? PendingScanSyncItem.Ready)?.attempts ?: 0) }.toMutableMap()
        val operations = mutableListOf<String>()

        override suspend fun listForSync(): List<PendingScanSyncItem> = rows.values.sortedBy(::pendingScanId)

        override suspend fun delete(id: Long) {
            operations += "delete:$id"
            rows.remove(id)
        }

        override suspend fun incrementAttemptsIfBelowMax(id: Long, maxAttempts: Int): Boolean {
            val current = attempts[id] ?: return false
            if (current >= maxAttempts) return false
            attempts[id] = current + 1
            operations += "increment:$id"
            return true
        }

        override suspend fun parkedCount(): Int = attempts.values.count { it >= MAX_PENDING_SCAN_ATTEMPTS }

        fun attemptsFor(id: Long): Int = attempts[id] ?: 0
        fun isPresent(id: Long): Boolean = rows.containsKey(id)
    }

}
