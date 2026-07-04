package id.sch.man1rokanhulu.absensi

import id.sch.man1rokanhulu.absensi.ui.ReaderDeviceKind
import id.sch.man1rokanhulu.absensi.ui.effectiveScanMode
import id.sch.man1rokanhulu.absensi.ui.friendlyActivationMessage
import id.sch.man1rokanhulu.absensi.ui.friendlyScanMessage
import id.sch.man1rokanhulu.absensi.ui.friendlyScanTitle
import id.sch.man1rokanhulu.absensi.ui.readerDeviceKind
import id.sch.man1rokanhulu.absensi.ui.readerDeviceTitle
import id.sch.man1rokanhulu.absensi.ui.readerModeSummary
import id.sch.man1rokanhulu.absensi.ui.selectableScanModes
import id.sch.man1rokanhulu.absensi.ui.safeScanHistoryMessage
import id.sch.man1rokanhulu.absensi.ui.shouldResetProvisioning
import id.sch.man1rokanhulu.absensi.ui.showManualModePicker
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReaderUxTest {
    @Test
    fun flexibleReaderUsesTwoSelectableModes() {
        val modes = listOf("GERBANG", "MUSHOLA", "CHECK_ONLY")

        assertEquals(ReaderDeviceKind.MIXED, readerDeviceKind(modes))
        assertEquals("HP Scanner", readerDeviceTitle(modes))
        assertEquals("Pilih Mode Gerbang, Mode Mushola, atau Cek Identitas", readerModeSummary(modes))
        assertEquals(listOf("GERBANG", "MUSHOLA", "CHECK_ONLY"), selectableScanModes(modes))
        assertEquals("GERBANG", effectiveScanMode(modes, "GATE_OUT"))
        assertEquals("MUSHOLA", effectiveScanMode(modes, "MUSHOLA"))
        assertTrue(showManualModePicker(modes))
    }

    @Test
    fun legacyGateReaderModesNormalizeToGerbang() {
        val modes = listOf("GATE_IN", "GATE_OUT")

        assertEquals(ReaderDeviceKind.GATE, readerDeviceKind(modes))
        assertEquals("HP Scanner", readerDeviceTitle(modes))
        assertEquals("Mode Gerbang tersedia", readerModeSummary(modes))
        assertEquals("GERBANG", effectiveScanMode(modes, "GATE_OUT"))
        assertFalse(showManualModePicker(modes))
    }

    @Test
    fun musholaReaderUsesScannerUx() {
        val modes = listOf("MUSHOLA")

        assertEquals(ReaderDeviceKind.MUSHOLA, readerDeviceKind(modes))
        assertEquals("HP Scanner", readerDeviceTitle(modes))
        assertEquals("Mode Mushola tersedia", readerModeSummary(modes))
        assertEquals("MUSHOLA", effectiveScanMode(modes, "CHECK_ONLY"))
        assertFalse(showManualModePicker(modes))
    }


    @Test
    fun checkOnlyLabelAndModeStaySelectable() {
        val modes = listOf("CHECK_ONLY")

        assertEquals(ReaderDeviceKind.CHECK_ONLY, readerDeviceKind(modes))
        assertEquals("Cek Identitas", readerDeviceTitle(modes))
        assertEquals("Mode: Cek Identitas", readerModeSummary(modes))
        assertEquals(listOf("CHECK_ONLY"), selectableScanModes(modes))
        assertEquals("CHECK_ONLY", effectiveScanMode(modes, "GERBANG"))
    }

    @Test
    fun friendlyMessagesHideTechnicalErrors() {
        assertEquals("HP scanner belum aktif atau dicabut. Minta admin aktivasi ulang.", friendlyScanMessage("Reader tidak aktif, dicabut, atau tidak ditemukan."))
        assertEquals("QR tidak cocok untuk mode scan ini", friendlyScanMessage("Mode Gerbang hanya untuk scan datang/pulang."))
        assertEquals("QR tidak cocok untuk mode scan ini", friendlyScanMessage("QR tidak cocok untuk mode scan ini"))
        assertEquals("Sudah tercatat", friendlyScanMessage("Dzuhur hari ini sudah tercatat."))
        assertEquals("Datang tercatat", friendlyScanMessage("Datang tercatat."))
        assertEquals("Pulang tercatat", friendlyScanMessage("Pulang tercatat."))
        assertEquals("Sudah tercatat", friendlyScanTitle(true, "Sudah tercatat."))
        assertTrue(shouldResetProvisioning("Reader sudah dicabut."))
        assertTrue(shouldResetProvisioning("Signature reader tidak valid.", 401))
        assertFalse(shouldResetProvisioning("Mode scan tidak diizinkan untuk reader ini.", 403))
        assertEquals("HP scanner belum aktif atau dicabut. Minta admin aktivasi ulang.", friendlyScanMessage("Signature reader tidak valid."))
    }

    @Test
    fun httpAndNetworkErrorsUseOperatorFriendlyMessages() {
        val serverProblem = friendlyScanMessage("HTTP 502")
        assertEquals("Server sedang bermasalah. Coba lagi sebentar atau hubungi operator IT.", serverProblem)
        assertFalse(serverProblem.contains("HTTP 502"))

        assertEquals("HP scanner belum aktif atau dicabut. Minta admin aktivasi ulang.", friendlyScanMessage("HTTP 403"))
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
        assertEquals("HP scanner belum aktif atau dicabut. Minta admin aktivasi ulang.", friendlyActivationMessage("HTTP 401"))
        assertEquals("Kode aktivasi tidak ditemukan. Minta admin membuat kode baru.", friendlyActivationMessage("HTTP 404"))
        assertEquals("Server belum bisa dihubungi. Periksa Wi-Fi atau internet HP.", friendlyActivationMessage("Network error timeout okhttp"))
    }

    @Test
    fun queueRetryHistoryMessagesAreSanitized() {
        val cases = listOf(
            "HTTP 502" to "Server sedang bermasalah. Coba lagi sebentar atau hubungi operator IT.",
            "HTTP 401 readerSecret shrsec_superSecret" to "HP scanner belum aktif atau dicabut. Minta admin aktivasi ulang.",
            "HTTP 403" to "HP scanner belum aktif atau dicabut. Minta admin aktivasi ulang.",
            "java.net.SocketTimeoutException: timeout from OkHttp" to "Server belum bisa dihubungi. Periksa Wi-Fi atau internet HP.",
            "Token provisioning tidak ditemukan: shrp_superSecretToken" to "Kode aktivasi salah atau sudah kedaluwarsa. Minta admin membuat kode baru.",
            "Invalid token shrp_rawToken" to "Kode aktivasi salah atau sudah kedaluwarsa. Minta admin membuat kode baru.",
            "Mode HP ini tidak cocok untuk scan ini." to "QR tidak cocok untuk mode scan ini",
            "QR tidak dikenal atau sudah dicabut." to "QR tidak dikenal atau sudah dicabut.",
            "Datang tercatat." to "Datang tercatat",
            "Pulang tercatat." to "Pulang tercatat",
            "Dzuhur hari ini sudah tercatat." to "Sudah tercatat"
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
