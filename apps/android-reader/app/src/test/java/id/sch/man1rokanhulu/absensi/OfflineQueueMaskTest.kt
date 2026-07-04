package id.sch.man1rokanhulu.absensi

import id.sch.man1rokanhulu.absensi.data.OfflineQueueRepository
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class OfflineQueueMaskTest {
    @Test fun offlineQueueMaskUsesLastFourOnly() {
        val masked = OfflineQueueRepository.maskQrForStorage("schoolhub:qr:v1:QR_TOPSECRETCODE")
        assertEquals("•••• CODE", masked)
    }

    @Test fun offlineQueueMaskHandlesShortInputLikeHistoryMask() {
        assertEquals("•••• ABC", OfflineQueueRepository.maskQrForStorage("ABC"))
        assertEquals("•••• ????", OfflineQueueRepository.maskQrForStorage(""))
    }

    @Test fun offlineQueueMaskNeverContainsRawPrefixOrSecret() {
        val masked = OfflineQueueRepository.maskQrForStorage("schoolhub:qr:v1:QR_TOPSECRETCODE")
        assertFalse(masked.contains("schoolhub"))
        assertFalse(masked.contains("TOPSECRET"))
    }
}
