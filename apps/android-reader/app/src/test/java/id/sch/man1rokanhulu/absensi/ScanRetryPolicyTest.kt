package id.sch.man1rokanhulu.absensi

import id.sch.man1rokanhulu.absensi.network.MAX_PENDING_SCAN_ATTEMPTS
import id.sch.man1rokanhulu.absensi.network.isPendingScanParked
import id.sch.man1rokanhulu.absensi.network.isRetryableScanStatus
import id.sch.man1rokanhulu.absensi.network.reachesPendingScanAttemptLimit
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ScanRetryPolicyTest {
    @Test fun pendingScanParksAtMaximumAttemptCount() {
        assertFalse(isPendingScanParked(MAX_PENDING_SCAN_ATTEMPTS - 1))
        assertTrue(isPendingScanParked(MAX_PENDING_SCAN_ATTEMPTS))
        assertTrue(isPendingScanParked(MAX_PENDING_SCAN_ATTEMPTS + 1))
    }

    @Test fun finalRetryAttemptParksRowWithoutDeletingIt() {
        assertFalse(reachesPendingScanAttemptLimit(MAX_PENDING_SCAN_ATTEMPTS - 2))
        assertTrue(reachesPendingScanAttemptLimit(MAX_PENDING_SCAN_ATTEMPTS - 1))
    }

    @Test fun onlyExpectedNetworkFailuresAreRetryable() {
        listOf(408, 425, 429, 500, 599).forEach { status -> assertTrue("HTTP $status", isRetryableScanStatus(status)) }
        listOf(null, 400, 401, 403, 404, 422, 499).forEach { status -> assertFalse("HTTP $status", isRetryableScanStatus(status)) }
    }
}
