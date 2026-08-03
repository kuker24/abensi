package id.sch.man1rokanhulu.absensi

import id.sch.man1rokanhulu.absensi.duty.ScanDutyService
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DutyModeSupportTest {
    @Test
    fun dutyServiceActionsAreStableForLifecycleBinding() {
        assertEquals("id.sch.man1rokanhulu.absensi.duty.START", ScanDutyService.ACTION_START)
        assertEquals("id.sch.man1rokanhulu.absensi.duty.STOP", ScanDutyService.ACTION_STOP)
        assertTrue(ScanDutyService.ACTION_START.contains("duty"))
        assertTrue(ScanDutyService.ACTION_STOP.endsWith("STOP"))
    }
}
