package id.sch.man1rokanhulu.absensi.update

import id.sch.man1rokanhulu.absensi.BuildConfig
import id.sch.man1rokanhulu.absensi.network.SchoolHubApiClient

object ApkUpdatePolicy {
    private fun hasDownload(info: SchoolHubApiClient.VersionInfo): Boolean = !info.downloadUrl.isNullOrBlank()

    fun isUpdateAvailable(info: SchoolHubApiClient.VersionInfo, currentCode: Int = BuildConfig.VERSION_CODE): Boolean =
        hasDownload(info) && info.latestVersionCode > currentCode

    fun isForceUpdate(info: SchoolHubApiClient.VersionInfo, currentCode: Int = BuildConfig.VERSION_CODE): Boolean =
        hasDownload(info) && (currentCode < info.minSupportedVersionCode || (info.forceUpdate && isUpdateAvailable(info, currentCode)))

    fun shouldShowUpdate(info: SchoolHubApiClient.VersionInfo, currentCode: Int = BuildConfig.VERSION_CODE): Boolean =
        isUpdateAvailable(info, currentCode) || isForceUpdate(info, currentCode)
}
