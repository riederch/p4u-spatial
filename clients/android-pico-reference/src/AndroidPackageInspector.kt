package at.p4u.spatial.update

import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.os.Build
import java.io.File
import java.security.MessageDigest

data class InstalledPackage(
    val versionName: String,
    val versionCode: Long,
    val signingCertificateSha256: String,
)

class AndroidPackageInspector(
    private val context: Context,
) {
    fun installed(): InstalledPackage {
        val pm = context.packageManager
        val info = packageInfo(pm, context.packageName)
        return InstalledPackage(
            versionName = info.versionName.orEmpty(),
            versionCode = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong(),
            signingCertificateSha256 = currentSignerFingerprint(info),
        )
    }

    fun archiveSignerSha256(apk: File): String {
        val pm = context.packageManager
        val flags = if (Build.VERSION.SDK_INT >= 28) {
            PackageManager.GET_SIGNING_CERTIFICATES
        } else {
            @Suppress("DEPRECATION")
            PackageManager.GET_SIGNATURES
        }
        @Suppress("DEPRECATION")
        val info = pm.getPackageArchiveInfo(apk.absolutePath, flags)
            ?: error("Downloaded file is not a readable Android package")
        return currentSignerFingerprint(info)
    }

    private fun packageInfo(pm: PackageManager, packageName: String): PackageInfo {
        val flags = if (Build.VERSION.SDK_INT >= 28) {
            PackageManager.GET_SIGNING_CERTIFICATES
        } else {
            @Suppress("DEPRECATION")
            PackageManager.GET_SIGNATURES
        }
        return if (Build.VERSION.SDK_INT >= 33) {
            pm.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(flags.toLong()))
        } else {
            @Suppress("DEPRECATION")
            pm.getPackageInfo(packageName, flags)
        }
    }

    private fun currentSignerFingerprint(info: PackageInfo): String {
        val signature = if (Build.VERSION.SDK_INT >= 28) {
            val signingInfo = info.signingInfo ?: error("Package has no signing information")
            val signers = if (signingInfo.hasMultipleSigners()) {
                signingInfo.apkContentsSigners
            } else {
                signingInfo.signingCertificateHistory
            }
            signers.firstOrNull() ?: error("Package has no signing certificate")
        } else {
            @Suppress("DEPRECATION")
            info.signatures?.firstOrNull() ?: error("Package has no signing certificate")
        }

        return MessageDigest.getInstance("SHA-256")
            .digest(signature.toByteArray())
            .joinToString("") { "%02x".format(it) }
    }
}
