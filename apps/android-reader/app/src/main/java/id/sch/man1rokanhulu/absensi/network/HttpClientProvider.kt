package id.sch.man1rokanhulu.absensi.network

import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

/**
 * Central OkHttp configuration for the reader app.
 *
 * TLS trust is governed by Android's network security config. Certificate pinning
 * is intentionally not enabled yet: enable it only after documenting certificate
 * rotation, backup pins, and operator-device update recovery for the production
 * host.
 */
object HttpClientProvider {
    val shared: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    val download: OkHttpClient = shared.newBuilder()
        .readTimeout(60, TimeUnit.SECONDS)
        .build()
}
