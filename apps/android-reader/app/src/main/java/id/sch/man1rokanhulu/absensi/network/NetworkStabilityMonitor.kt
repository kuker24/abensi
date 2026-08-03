package id.sch.man1rokanhulu.absensi.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import id.sch.man1rokanhulu.absensi.ui.components.ConnectionStatus
import java.util.concurrent.atomic.AtomicBoolean

data class NetworkSnapshot(
    val status: ConnectionStatus,
    val transport: String,
    val validated: Boolean
)

/**
 * Real-time network path observer for operator feedback and reconnect flush.
 * Does not replace health checks; use [markHealth] for server reachability.
 */
class NetworkStabilityMonitor(context: Context) {
    private val appContext = context.applicationContext
    private val manager = appContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    private val started = AtomicBoolean(false)
    private var listener: ((NetworkSnapshot, Boolean) -> Unit)? = null
    private var lastSnapshot = NetworkSnapshot(ConnectionStatus.CHECKING, "UNKNOWN", false)
    private var serverReachable: Boolean? = null

    private val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) = emit()
        override fun onLost(network: Network) = emit()
        override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) = emit()
        override fun onUnavailable() = emit()
    }

    fun start(onChange: (NetworkSnapshot, Boolean) -> Unit) {
        listener = onChange
        if (!started.compareAndSet(false, true)) {
            onChange(snapshot(), false)
            return
        }
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        runCatching { manager.registerNetworkCallback(request, callback) }
        emit(force = true)
    }

    fun stop() {
        if (!started.compareAndSet(true, false)) return
        runCatching { manager.unregisterNetworkCallback(callback) }
        listener = null
    }

    fun snapshot(): NetworkSnapshot = lastSnapshot

    fun markHealth(ok: Boolean, latencyMs: Long) {
        serverReachable = ok
        val base = readTransport()
        val status = when {
            base.transport == "OFFLINE" -> ConnectionStatus.OFFLINE
            !ok -> ConnectionStatus.OFFLINE
            latencyMs > 1800 -> ConnectionStatus.SLOW
            !base.validated -> ConnectionStatus.SLOW
            else -> ConnectionStatus.ONLINE
        }
        publish(base.copy(status = status), force = true)
    }

    private fun emit(force: Boolean = false) {
        val transport = readTransport()
        val status = when {
            transport.transport == "OFFLINE" -> ConnectionStatus.OFFLINE
            !transport.validated -> ConnectionStatus.OFFLINE
            serverReachable == false -> ConnectionStatus.OFFLINE
            serverReachable == true -> ConnectionStatus.ONLINE
            else -> ConnectionStatus.CHECKING
        }
        publish(transport.copy(status = status), force)
    }

    private fun publish(next: NetworkSnapshot, force: Boolean) {
        val previous = lastSnapshot
        val wasOffline = previous.status == ConnectionStatus.OFFLINE
        val becameOnline = next.status == ConnectionStatus.ONLINE || next.status == ConnectionStatus.SLOW
        val recovered = wasOffline && becameOnline
        if (!force && next == previous) return
        lastSnapshot = next
        listener?.invoke(next, recovered)
    }

    private fun readTransport(): NetworkSnapshot {
        val network = manager.activeNetwork
        val caps = network?.let { manager.getNetworkCapabilities(it) }
        if (network == null || caps == null) {
            return NetworkSnapshot(ConnectionStatus.OFFLINE, "OFFLINE", false)
        }
        val validated = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        val transport = when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WIFI"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "CELLULAR"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ETHERNET"
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) -> "ONLINE"
            else -> "OFFLINE"
        }
        val status = if (transport == "OFFLINE" || !validated) ConnectionStatus.OFFLINE else ConnectionStatus.CHECKING
        return NetworkSnapshot(status, transport, validated)
    }
}
