package id.sch.man1rokanhulu.absensi

import id.sch.man1rokanhulu.absensi.ui.screens.buildCheckOnlySummary
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ScannerIdentitySummaryTest {
    @Test
    fun checkOnlyStudentSummaryShowsOnlyAllowedBiodata() {
        val summary = buildCheckOnlySummary(
            name = "Siswa Satu",
            roleRaw = "SISWA",
            className = "Kelas X A",
            cardStatus = "ACTIVE",
            nis = "12345",
            nip = null,
            birthDate = "2010-01-31"
        )

        assertEquals("Siswa Satu", summary.displayName)
        assertEquals("SISWA · Kelas X A · NIS 12345", summary.displayMeta)
        assertEquals("Cek Identitas", summary.actionLabel)
        val message = summary.feedbackMessage.orEmpty()
        assertTrue(message.contains("Nama: Siswa Satu"))
        assertTrue(message.contains("NIS: 12345"))
        assertTrue(message.contains("Tanggal lahir: 2010-01-31"))
        assertTrue(message.contains("Kelas: Kelas X A"))
        assertTrue(message.contains("Status kartu: ACTIVE"))
        assertFalse(message.contains("Alamat"))
        assertFalse(message.contains("internal-user-id"))
        assertFalse(message.contains("schoolhub:qr"))
        assertFalse(message.contains("shrp_"))
        assertFalse(message.contains("shrsec_"))
        assertFalse(message.contains("signature"))
        assertFalse(message.contains("nonce"))
    }

    @Test
    fun checkOnlyTeacherSummaryShowsNipWithoutBirthDateOrAddress() {
        val summary = buildCheckOnlySummary(
            name = "Guru Satu",
            roleRaw = "GURU_MAPEL",
            className = null,
            cardStatus = "ACTIVE",
            nis = null,
            nip = "198001012006041001",
            birthDate = "1980-01-01"
        )

        assertEquals("Guru Satu", summary.displayName)
        assertEquals("GURU MAPEL · NIP 198001012006041001", summary.displayMeta)
        val message = summary.feedbackMessage.orEmpty()
        assertTrue(message.contains("Nama: Guru Satu"))
        assertTrue(message.contains("NIP: 198001012006041001"))
        assertTrue(message.contains("Role/Jabatan: GURU MAPEL"))
        assertTrue(message.contains("Status kartu: ACTIVE"))
        assertFalse(message.contains("Tanggal lahir"))
        assertFalse(message.contains("Alamat"))
    }
}
