package id.sch.man1rokanhulu.absensi.network

import okhttp3.ConnectionPool
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

/**
 * Central OkHttp configuration for the reader app.
 *
 * TLS trust is governed by Android's network security config. Certificate pinning
 * is intentionally not enabled yet: enable it only after documenting certificate
 * rotation, backup pins, and operator-device update recovery for the production
 * host.
 *
 * Connection pool + ping keep HTTPS sessions warm for continuous gate scans so
 * each QR does not pay a full TCP/TLS setup when the previous keep-alive is still live.
 */
object HttpClientProvider {
    private val connectionPool = ConnectionPool(
        /* maxIdleConnections */ 5,
        /* keepAliveDuration */ 5,
        TimeUnit.MINUTES
    )

    val shared: OkHttpClient = OkHttpClient.Builder()
        .connectionPool(connectionPool)
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(20, TimeUnit.SECONDS)
        .callTimeout(30, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .pingInterval(30, TimeUnit.SECONDS)
        .build()

    val download: OkHttpClient = shared.newBuilder()
        .readTimeout(60, TimeUnit.SECONDS)
        .callTimeout(0, TimeUnit.MILLISECONDS)
        .build()
}
