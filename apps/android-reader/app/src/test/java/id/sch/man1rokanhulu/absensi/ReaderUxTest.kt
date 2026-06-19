package id.sch.man1rokanhulu.absensi

import id.sch.man1rokanhulu.absensi.ui.ReaderDeviceKind
import id.sch.man1rokanhulu.absensi.ui.effectiveScanMode
import id.sch.man1rokanhulu.absensi.ui.friendlyActivationMessage
import id.sch.man1rokanhulu.absensi.ui.friendlyScanMessage
import id.sch.man1rokanhulu.absensi.ui.friendlyScanTitle
import id.sch.man1rokanhulu.absensi.ui.readerDeviceKind
import id.sch.man1rokanhulu.absensi.ui.readerDeviceTitle
import id.sch.man1rokanhulu.absensi.ui.readerModeSummary
import id.sch.man1rokanhulu.absensi.ui.safeScanHistoryMessage
import id.sch.man1rokanhulu.absensi.ui.shouldResetProvisioning
import id.sch.man1rokanhulu.absensi.ui.showManualModePicker
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReaderUxTest {
    @Test
    fun gateReaderUsesDedicatedGateUxAndAutoMode() {
        val modes = listOf("GATE_IN", "GATE_OUT")

        assertEquals(ReaderDeviceKind.GATE, readerDeviceKind(modes))
        assertEquals("HP Gerbang", readerDeviceTitle(modes))
        assertEquals("Mode: Datang & Pulang", readerModeSummary(modes))
        assertEquals("GATE_IN", effectiveScanMode(modes, "GATE_OUT"))
        assertFalse(showManualModePicker(modes))
    }

    @Test
    fun musholaReaderUsesDedicatedMusholaUx() {
        val modes = listOf("MUSHOLA")

        assertEquals(ReaderDeviceKind.MUSHOLA, readerDeviceKind(modes))
        assertEquals("HP Mushola", readerDeviceTitle(modes))
        assertTrue(readerModeSummary(modes).startsWith("Sholat saat ini:"))
        assertEquals("MUSHOLA", effectiveScanMode(modes, "CHECK_ONLY"))
        assertFalse(showManualModePicker(modes))
    }

    @Test
    fun friendlyMessagesHideTechnicalErrors() {
        assertEquals("HP scanner ini sudah dicabut atau dinonaktifkan. Minta admin aktivasi ulang.", friendlyScanMessage("Reader tidak aktif, dicabut, atau tidak ditemukan."))
        assertEquals("HP ini tidak cocok untuk scan ini. Gunakan HP scanner yang sesuai.", friendlyScanMessage("Mode HP Gerbang hanya untuk siswa lain."))
        assertEquals("Sudah tercatat.", friendlyScanMessage("Dzuhur hari ini sudah tercatat."))
        assertEquals("Sudah tercatat", friendlyScanTitle(true, "Sudah tercatat."))
        assertTrue(shouldResetProvisioning("Reader sudah dicabut."))
    }

    @Test
    fun httpAndNetworkErrorsUseOperatorFriendlyMessages() {
        val serverProblem = friendlyScanMessage("HTTP 502")
        assertEquals("Server sedang bermasalah. Coba lagi sebentar atau hubungi operator IT.", serverProblem)
        assertFalse(serverProblem.contains("HTTP 502"))

        assertEquals("HP scanner belum aktif atau aksesnya sudah dicabut. Minta admin aktivasi ulang.", friendlyScanMessage("HTTP 403"))
        assertEquals("Server belum bisa dihubungi. Periksa Wi-Fi atau internet HP.", friendlyScanMessage("java.net.UnknownHostException: Unable to resolve host"))
        assertEquals("QR tidak dikenal atau sudah dicabut.", friendlyScanMessage("HTTP 404"))
        assertEquals("QR tidak dikenal atau sudah dicabut.", friendlyScanMessage("QR tidak dikenal atau sudah dicabut."))
    }

    @Test
    fun provisioningTokenErrorsUseActivationMessageWithoutRawToken() {
        val notFound = friendlyActivationMessage("Token provisioning tidak ditemukan: shrp_superSecretToken")
        val invalid = friendlyActivationMessage("Invalid token")
        val expired = friendlyActivationMessage("Token provisioning expired")

        assertEquals("Kode aktivasi salah atau sudah kedaluwarsa. Minta admin membuat kode baru.", notFound)
        assertEquals("Kode aktivasi salah atau sudah kedaluwarsa. Minta admin membuat kode baru.", invalid)
        assertEquals("Kode aktivasi salah atau sudah kedaluwarsa. Minta admin membuat kode baru.", expired)
        assertFalse(notFound.contains("shrp_"))
        assertEquals("Server sedang bermasalah. Coba lagi sebentar atau hubungi operator IT.", friendlyActivationMessage("HTTP 500 stack trace"))
        assertEquals("HP scanner ini sudah dicabut atau dinonaktifkan. Minta admin aktivasi ulang.", friendlyActivationMessage("HTTP 401"))
        assertEquals("Kode aktivasi tidak ditemukan. Minta admin membuat kode baru.", friendlyActivationMessage("HTTP 404"))
        assertEquals("Server belum bisa dihubungi. Periksa Wi-Fi atau internet HP.", friendlyActivationMessage("Network error timeout okhttp"))
    }

    @Test
    fun queueRetryHistoryMessagesAreSanitized() {
        val cases = listOf(
            "HTTP 502" to "Server sedang bermasalah. Coba lagi sebentar atau hubungi operator IT.",
            "HTTP 401 readerSecret shrsec_superSecret" to "HP scanner belum aktif atau aksesnya sudah dicabut. Minta admin aktivasi ulang.",
            "HTTP 403" to "HP scanner belum aktif atau aksesnya sudah dicabut. Minta admin aktivasi ulang.",
            "java.net.SocketTimeoutException: timeout from OkHttp" to "Server belum bisa dihubungi. Periksa Wi-Fi atau internet HP.",
            "Token provisioning tidak ditemukan: shrp_superSecretToken" to "Kode aktivasi salah atau sudah kedaluwarsa. Minta admin membuat kode baru.",
            "Invalid token shrp_rawToken" to "Kode aktivasi salah atau sudah kedaluwarsa. Minta admin membuat kode baru.",
            "Mode HP ini tidak cocok untuk scan ini." to "HP ini tidak cocok untuk scan ini. Gunakan HP scanner yang sesuai.",
            "QR tidak dikenal atau sudah dicabut." to "QR tidak dikenal atau sudah dicabut.",
            "Dzuhur hari ini sudah tercatat." to "Sudah tercatat."
        )

        cases.forEach { (raw, expected) ->
            val stored = safeScanHistoryMessage(raw, "Fallback aman.")
            assertEquals(expected, stored)
            assertFalse(stored.contains("HTTP 502"))
            assertFalse(stored.contains("HTTP 500"))
            assertFalse(stored.contains("Exception"))
            assertFalse(stored.contains("Retrofit"))
            assertFalse(stored.contains("OkHttp"))
            assertFalse(stored.contains("shrp_"))
            assertFalse(stored.contains("shrsec_"))
        }
    }
}
