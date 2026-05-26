package id.sch.man1rokanhulu.absensi

import id.sch.man1rokanhulu.absensi.data.ScanHistoryStatus
import id.sch.man1rokanhulu.absensi.data.ScanHistoryStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ScanHistoryStoreTest {
    @Test fun maskedQrShowsOnlyLastFourCharacters() {
        val masked = ScanHistoryStore.maskQr("QR_7F3K9X2P8LQ0")
        assertEquals("•••• 8LQ0", masked)
    }

    @Test fun maskedQrHandlesShortInput() {
        val masked = ScanHistoryStore.maskQr("ABC")
        assertEquals("•••• ABC", masked)
    }

    @Test fun maskedQrHandlesEmptyInput() {
        val masked = ScanHistoryStore.maskQr("")
        assertEquals("•••• ????", masked)
    }

    @Test fun maskedQrNeverContainsRawSecretLikePrefix() {
        val masked = ScanHistoryStore.maskQr("schoolhub:qr:v1:QR_TOPSECRETCODE")
        assertTrue(!masked.contains("schoolhub"))
        assertTrue(!masked.contains("TOPSECRET"))
    }

    @Test fun historyEntryMasksOpaqueQrCode() {
        val entry = ScanHistoryStore.entry("GATE_IN", ScanHistoryStatus.QUEUED, "QR_TOPSECRETCODE", "Menunggu")
        assertEquals("GATE_IN", entry.mode)
        assertEquals(ScanHistoryStatus.QUEUED, entry.status)
        assertEquals("•••• CODE", entry.maskedCode)
        assertTrue(!entry.maskedCode.contains("TOPSECRET"))
    }
}
