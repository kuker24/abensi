package id.sch.man1rokanhulu.absensi

import id.sch.man1rokanhulu.absensi.ui.components.targetFeedbackVolume
import org.junit.Assert.assertEquals
import org.junit.Test

class FeedbackVolumeTest {
    @Test
    fun clampsAtLeastEightyPercentOfMax() {
        assertEquals(12, targetFeedbackVolume(maxVolume = 15, currentVolume = 3))
        assertEquals(8, targetFeedbackVolume(maxVolume = 10, currentVolume = 0))
        assertEquals(15, targetFeedbackVolume(maxVolume = 15, currentVolume = 15))
        assertEquals(13, targetFeedbackVolume(maxVolume = 15, currentVolume = 13))
    }

    @Test
    fun zeroMaxIsZero() {
        assertEquals(0, targetFeedbackVolume(maxVolume = 0, currentVolume = 5))
    }
}
