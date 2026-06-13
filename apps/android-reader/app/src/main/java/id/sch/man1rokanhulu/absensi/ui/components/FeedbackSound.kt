package id.sch.man1rokanhulu.absensi.ui.components

import android.content.Context
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator

@Suppress("DEPRECATION")
fun playFeedbackSound(context: Context, tone: FeedbackTone, soundEnabled: Boolean, vibrationEnabled: Boolean) {
    if (soundEnabled) {
        val toneType = when (tone) {
            FeedbackTone.SUCCESS -> ToneGenerator.TONE_PROP_ACK
            FeedbackTone.PENDING -> ToneGenerator.TONE_PROP_BEEP
            FeedbackTone.ERROR -> ToneGenerator.TONE_PROP_NACK
            else -> ToneGenerator.TONE_PROP_BEEP
        }
        val toneDuration = when (tone) {
            FeedbackTone.SUCCESS -> 120
            FeedbackTone.PENDING -> 260
            FeedbackTone.ERROR -> 500
            else -> 80
        }
        runCatching {
            val tg = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 90)
            tg.startTone(toneType, toneDuration)
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({ runCatching { tg.release() } }, (toneDuration + 50).toLong())
        }
    }
    if (!vibrationEnabled) return
    val vibrator = context.getSystemService(Vibrator::class.java) ?: return
    when (tone) {
        FeedbackTone.SUCCESS -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                vibrator.vibrate(VibrationEffect.createOneShot(90, VibrationEffect.DEFAULT_AMPLITUDE))
            else vibrator.vibrate(90)
        }
        FeedbackTone.ERROR -> {
            val pattern = longArrayOf(0, 140, 90, 180)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
            else vibrator.vibrate(pattern, -1)
        }
        FeedbackTone.PENDING -> {
            val pattern = longArrayOf(0, 80, 80, 80)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
            else vibrator.vibrate(pattern, -1)
        }
        else -> Unit
    }
}
