package id.sch.man1rokanhulu.absensi.ui.components

import android.content.Context
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.ToneGenerator
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import id.sch.man1rokanhulu.absensi.R
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

private val mainHandler = Handler(Looper.getMainLooper())
@Volatile private var activePlayer: MediaPlayer? = null

/** Clamp playback stream to at least 80% of device max (cap 100%). */
internal fun targetFeedbackVolume(maxVolume: Int, currentVolume: Int): Int {
    if (maxVolume <= 0) return 0
    val floor = max(1, ceil(maxVolume * 0.8).toInt())
    return min(maxVolume, max(floor, currentVolume.coerceIn(0, maxVolume)))
}

private fun withForcedMusicVolume(context: Context, restoreAfterMs: Long, play: () -> Unit) {
    val am = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: run {
        play()
        return
    }
    val stream = AudioManager.STREAM_MUSIC
    val maxVol = am.getStreamMaxVolume(stream)
    val previous = am.getStreamVolume(stream)
    val target = targetFeedbackVolume(maxVol, previous)
    runCatching {
        if (target != previous) am.setStreamVolume(stream, target, 0)
    }
    try {
        play()
    } finally {
        mainHandler.postDelayed({
            runCatching { am.setStreamVolume(stream, previous, 0) }
        }, restoreAfterMs)
    }
}

private fun stopActivePlayer() {
    val player = activePlayer
    activePlayer = null
    if (player != null) {
        runCatching {
            if (player.isPlaying) player.stop()
            player.release()
        }
    }
}

private fun playFailVoice(context: Context) {
    stopActivePlayer()
    runCatching {
        val player = MediaPlayer.create(context, R.raw.gagal) ?: return@runCatching
        activePlayer = player
        player.setVolume(1f, 1f)
        player.setOnCompletionListener {
            runCatching { it.release() }
            if (activePlayer === it) activePlayer = null
        }
        player.setOnErrorListener { mp, _, _ ->
            runCatching { mp.release() }
            if (activePlayer === mp) activePlayer = null
            true
        }
        player.start()
    }
}

private fun playTone(tone: FeedbackTone) {
    val toneType = when (tone) {
        FeedbackTone.SUCCESS -> ToneGenerator.TONE_PROP_ACK
        FeedbackTone.PENDING -> ToneGenerator.TONE_PROP_BEEP
        FeedbackTone.ERROR -> ToneGenerator.TONE_PROP_NACK
        else -> ToneGenerator.TONE_PROP_BEEP
    }
    val toneDuration = when (tone) {
        FeedbackTone.SUCCESS -> 180
        FeedbackTone.PENDING -> 260
        FeedbackTone.ERROR -> 500
        else -> 80
    }
    runCatching {
        val tg = ToneGenerator(AudioManager.STREAM_MUSIC, 100)
        tg.startTone(toneType, toneDuration)
        mainHandler.postDelayed({ runCatching { tg.release() } }, (toneDuration + 50).toLong())
    }
}

@Suppress("DEPRECATION")
fun playFeedbackSound(context: Context, tone: FeedbackTone, soundEnabled: Boolean, vibrationEnabled: Boolean) {
    if (soundEnabled) {
        when (tone) {
            FeedbackTone.ERROR -> withForcedMusicVolume(context, restoreAfterMs = 1400L) { playFailVoice(context) }
            FeedbackTone.SUCCESS -> withForcedMusicVolume(context, restoreAfterMs = 400L) { playTone(tone) }
            FeedbackTone.PENDING -> withForcedMusicVolume(context, restoreAfterMs = 500L) { playTone(tone) }
            else -> Unit
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
