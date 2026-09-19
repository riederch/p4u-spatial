package at.p4u.spatial.update

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import java.io.File

sealed interface InstallLaunchResult {
    data object UserActionRequired : InstallLaunchResult
    data object UnknownSourcePermissionRequired : InstallLaunchResult
}

class AndroidInteractiveInstaller(
    private val context: Context,
    private val fileProviderAuthority: String = "${context.packageName}.updates",
) {
    fun launch(apk: File): InstallLaunchResult {
        require(apk.isFile) { "Verified APK file does not exist" }

        if (Build.VERSION.SDK_INT >= 26 && !context.packageManager.canRequestPackageInstalls()) {
            val settings = Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${context.packageName}"),
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(settings)
            return InstallLaunchResult.UnknownSourcePermissionRequired
        }

        val uri = FileProvider.getUriForFile(context, fileProviderAuthority, apk)
        val intent = Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
            data = uri
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true)
            putExtra(Intent.EXTRA_RETURN_RESULT, false)
        }
        context.startActivity(intent)
        return InstallLaunchResult.UserActionRequired
    }
}
