package at.p4u.spatial.scanner

import android.app.Activity
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import at.p4u.spatial.update.AndroidInteractiveInstaller
import at.p4u.spatial.update.AndroidPackageInspector
import at.p4u.spatial.update.BridgeReleaseClient
import at.p4u.spatial.update.InstallLaunchResult
import at.p4u.spatial.update.VerifiedApkStore
import java.util.concurrent.Executors

class MainActivity : Activity() {
    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var bridgeInput: EditText
    private lateinit var status: TextView
    private lateinit var checkButton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(buildUi())
        showInstalledVersion()
    }

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }

    private fun buildUi(): ScrollView {
        val prefs = getSharedPreferences("p4u-scanner", MODE_PRIVATE)
        val density = resources.displayMetrics.density
        val padding = (24 * density).toInt()

        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(padding, padding, padding, padding)
        }

        column.addView(TextView(this).apply {
            text = "P4U Spatial Scanner"
            textSize = 28f
        }, fullWidth())

        bridgeInput = EditText(this).apply {
            hint = "Bridge URL, z. B. https://p4u.example"
            setText(prefs.getString("bridge-url", ""))
            isSingleLine = true
        }
        column.addView(bridgeInput, fullWidth())

        val save = Button(this).apply {
            text = "Bridge speichern"
            setOnClickListener {
                prefs.edit().putString("bridge-url", bridgeInput.text.toString().trim()).apply()
                status.text = "Bridge gespeichert."
            }
        }
        column.addView(save, fullWidth())

        checkButton = Button(this).apply {
            text = "Auf Update prüfen"
            setOnClickListener { checkForUpdate() }
        }
        column.addView(checkButton, fullWidth())

        status = TextView(this).apply {
            textSize = 18f
            setPadding(0, padding, 0, 0)
        }
        column.addView(status, fullWidth())

        return ScrollView(this).apply { addView(column) }
    }

    private fun fullWidth() = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT,
    )

    private fun showInstalledVersion() {
        runCatching { AndroidPackageInspector(this).installed() }
            .onSuccess { installed ->
                status.text = "Installiert: ${installed.versionName} (versionCode ${installed.versionCode})"
            }
            .onFailure { error ->
                status.text = "Installierte Version konnte nicht gelesen werden: ${error.message}"
            }
    }

    private fun checkForUpdate() {
        val bridge = bridgeInput.text.toString().trim()
        if (!bridge.startsWith("https://") && !bridge.startsWith("http://")) {
            status.text = "Bitte eine gültige Bridge-URL eintragen."
            return
        }

        checkButton.isEnabled = false
        status.text = "Prüfe Update …"

        executor.execute {
            runCatching {
                val inspector = AndroidPackageInspector(this)
                val installed = inspector.installed()
                val xrAppBase = BridgeDiscoveryClient().xrAppContract(bridge)
                val releaseClient = BridgeReleaseClient(xrAppBase)
                val release = releaseClient.latest("stable")

                if (release.versionCode <= installed.versionCode) {
                    return@runCatching "Bereits aktuell: ${installed.versionName}."
                }

                val bytes = releaseClient.download(release)
                val apk = VerifiedApkStore(this).stage(release, bytes)
                val archiveSigner = inspector.archiveSignerSha256(apk)
                val installedSigner = installed.signingCertificateSha256.replace(":", "").lowercase()
                val expectedSigner = release.signingCertificateSha256.replace(":", "").lowercase()

                require(archiveSigner == expectedSigner) {
                    "APK-Signatur stimmt nicht mit dem Release-Descriptor überein."
                }
                require(archiveSigner == installedSigner) {
                    "APK wurde nicht mit derselben Signatur wie die installierte App signiert."
                }

                when (AndroidInteractiveInstaller(this).launch(apk)) {
                    InstallLaunchResult.UserActionRequired ->
                        "APK verifiziert. Android/PICO-Installation wurde geöffnet."
                    InstallLaunchResult.UnknownSourcePermissionRequired ->
                        "Bitte Installation aus dieser Quelle erlauben und danach erneut auf Update prüfen."
                }
            }.onSuccess { message ->
                runOnUiThread {
                    status.text = message
                    checkButton.isEnabled = true
                }
            }.onFailure { error ->
                runOnUiThread {
                    status.text = "Update fehlgeschlagen: ${error.message}"
                    checkButton.isEnabled = true
                }
            }
        }
    }
}
