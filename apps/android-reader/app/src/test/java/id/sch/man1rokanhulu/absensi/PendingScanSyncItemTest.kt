package id.sch.man1rokanhulu.absensi

import id.sch.man1rokanhulu.absensi.data.PendingScan
import id.sch.man1rokanhulu.absensi.data.PendingScanDecryptionException
import id.sch.man1rokanhulu.absensi.data.PendingScanSyncItem
import id.sch.man1rokanhulu.absensi.data.mapPendingScansForSync
import id.sch.man1rokanhulu.absensi.data.selectReadyPendingScans
import id.sch.man1rokanhulu.absensi.network.MAX_PENDING_SCAN_ATTEMPTS
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PendingScanSyncItemTest {
    @Test
    fun readySelectionSkipsParkedOldestRowAndKeepsLaterRow() {
        val parked = pending(id = 1, encrypted = "parked", attempts = MAX_PENDING_SCAN_ATTEMPTS)
        val ready = pending(id = 2, encrypted = "ready", attempts = 0)

        val selected = selectReadyPendingScans(listOf(parked, ready))

        assertEquals(listOf(2L), selected.map(PendingScan::id))
    }

    @Test
    fun malformedCiphertextDoesNotAbortLaterReadyItemOrExposeRawQr() {
        val badCiphertext = pending(id = 1, encrypted = "ciphertext-value", attempts = 0)
        val ready = pending(id = 2, encrypted = "good", attempts = 0)

        val items = mapPendingScansForSync(listOf(badCiphertext, ready)) { encrypted ->
            if (encrypted == "ciphertext-value") throw PendingScanDecryptionException()
            "schoolhub:qr:v1:QR_ABCDEFGHIJ"
        }

        val malformed = items[0] as PendingScanSyncItem.Malformed
        val mappedReady = items[1] as PendingScanSyncItem.Ready
        assertEquals(1L, malformed.id)
        assertFalse(malformed.toString().contains("ciphertext-value"))
        assertFalse(malformed.toString().contains("•••• safe"))
        assertEquals(2L, mappedReady.id)
        assertEquals("QR_ABCDEFGHIJ", mappedReady.parsedQr.opaqueCode)
    }

    @Test
    fun unexpectedDecryptFailureDoesNotBecomeRetryableOrExposeRawQr() {
        val row = pending(id = 1, encrypted = "ciphertext-value", attempts = 0)

        val item = mapPendingScansForSync(listOf(row)) { throw IllegalStateException("ciphertext-value") }.single()

        assertTrue(item is PendingScanSyncItem.Unexpected)
        assertFalse(item.toString().contains("ciphertext-value"))
    }

    @Test
    fun malformedDecryptedQrIsTerminalButLaterReadyItemMaps() {
        val malformedQr = pending(id = 1, encrypted = "invalid", attempts = 0)
        val ready = pending(id = 2, encrypted = "valid", attempts = 0)

        val items = mapPendingScansForSync(listOf(malformedQr, ready)) { encrypted ->
            if (encrypted == "invalid") "not-a-schoolhub-qr"
            else "schoolhub:qr:v1:QR_ABCDEFGHIJ"
        }

        assertTrue(items[0] is PendingScanSyncItem.Malformed)
        assertTrue(items[1] is PendingScanSyncItem.Ready)
    }

    private fun pending(id: Long, encrypted: String, attempts: Int) = PendingScan(
        id = id,
        qrCodeMasked = "•••• safe",
        qrCodeEncrypted = encrypted,
        mode = "GERBANG",
        createdAt = id,
        attempts = attempts
    )
}
