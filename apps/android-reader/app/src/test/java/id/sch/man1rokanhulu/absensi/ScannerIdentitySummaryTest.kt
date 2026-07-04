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
        assertNoRestrictedIdentityTerms(message)
    }

    @Test
    fun checkOnlyStudentWithJsonNullClassNameDoesNotShowNullClassLine() {
        val summary = buildCheckOnlySummary(
            name = "Siswa Null",
            roleRaw = "SISWA",
            className = "null",
            cardStatus = "ACTIVE",
            nis = "12345",
            nip = null,
            birthDate = "2010-01-31"
        )

        val message = summary.feedbackMessage.orEmpty()
        assertTrue(message.contains("Nama: Siswa Null"))
        assertTrue(message.contains("NIS: 12345"))
        assertTrue(message.contains("Tanggal lahir: 2010-01-31"))
        assertFalse(message.contains("Kelas:"))
        assertFalse(message.contains("Kelas: null"))
        assertNoRestrictedIdentityTerms(message)
    }

    @Test
    fun checkOnlyStudentWithMissingClassNameDoesNotShowClassLine() {
        val summary = buildCheckOnlySummary(
            name = "Siswa Tanpa Kelas",
            roleRaw = "SISWA",
            className = null,
            cardStatus = "ACTIVE",
            nis = "12345",
            nip = null,
            birthDate = "2010-01-31"
        )

        val message = summary.feedbackMessage.orEmpty()
        assertTrue(message.contains("Nama: Siswa Tanpa Kelas"))
        assertFalse(message.contains("Kelas:"))
        assertNoRestrictedIdentityTerms(message)
    }

    @Test
    fun checkOnlyStudentWithRealClassNameShowsClassLine() {
        val summary = buildCheckOnlySummary(
            name = "Siswa Berkelas",
            roleRaw = "SISWA",
            className = "X IPA 1",
            cardStatus = "ACTIVE",
            nis = "12345",
            nip = null,
            birthDate = "2010-01-31"
        )

        val message = summary.feedbackMessage.orEmpty()
        assertTrue(message.contains("Kelas: X IPA 1"))
        assertEquals("SISWA · X IPA 1 · NIS 12345", summary.displayMeta)
        assertNoRestrictedIdentityTerms(message)
    }

    @Test
    fun checkOnlyStudentHidesStringNullAndUndefinedIdentityFields() {
        val summary = buildCheckOnlySummary(
            name = "Siswa Dua",
            roleRaw = "SISWA",
            className = "undefined",
            cardStatus = "null",
            nis = " ",
            nip = null,
            birthDate = "NULL"
        )

        val message = summary.feedbackMessage.orEmpty()
        assertTrue(message.contains("Nama: Siswa Dua"))
        assertFalse(message.contains("NIS:"))
        assertFalse(message.contains("Tanggal lahir"))
        assertFalse(message.contains("Kelas:"))
        assertFalse(message.contains("Status kartu"))
        assertFalse(message.contains("undefined"))
        assertFalse(message.contains("null"))
        assertNoRestrictedIdentityTerms(message)
    }

    @Test
    fun checkOnlyTeacherSummaryShowsNipWithoutBirthDateClassOrAddress() {
        val summary = buildCheckOnlySummary(
            name = "Guru Satu",
            roleRaw = "GURU_MAPEL",
            className = "X IPA 1",
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
        assertFalse(message.contains("Kelas:"))
        assertNoRestrictedIdentityTerms(message)
    }

    private fun assertNoRestrictedIdentityTerms(message: String) {
        assertFalse(message.contains("Alamat", ignoreCase = true))
        assertFalse(message.contains("username", ignoreCase = true))
        assertFalse(message.contains("id", ignoreCase = true))
        assertFalse(message.contains("schoolhub:qr", ignoreCase = true))
        assertFalse(message.contains("signature", ignoreCase = true))
        assertFalse(message.contains("nonce", ignoreCase = true))
    }
}
