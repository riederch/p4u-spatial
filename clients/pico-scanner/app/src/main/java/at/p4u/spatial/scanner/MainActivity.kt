package at.p4u.spatial.scanner

import android.app.Activity
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.Spinner
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
    private lateinit var bridgeNameInput: EditText
    private lateinit var bridgeLocalUrlInput: EditText
    private lateinit var bridgePublicUrlInput: EditText
    private lateinit var bridgeSpinner: Spinner
    private lateinit var deviceNameInput: EditText
    private lateinit var profiles: BridgeProfileStore
    private lateinit var deviceIdentity: DeviceIdentityStore
    private lateinit var status: TextView
    private lateinit var checkButton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        profiles = BridgeProfileStore(this)
        deviceIdentity = DeviceIdentityStore(this)
        migrateLegacyBridge()
        setContentView(buildUi())
        showInstalledVersion()
    }

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }

    private fun buildUi(): ScrollView {
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

        deviceNameInput = EditText(this).apply {
            hint = "Lokaler Brillenname, z. B. PICO Christoph"
            setText(deviceIdentity.localName())
            isSingleLine = true
        }
        column.addView(deviceNameInput, fullWidth())
        column.addView(Button(this).apply {
            text = "Brillenname speichern"
            setOnClickListener {
                runCatching { deviceIdentity.setLocalName(deviceNameInput.text.toString()) }
                    .onSuccess { status.text = "Lokaler Brillenname gespeichert." }
                    .onFailure { status.text = "Brillenname ungültig: " + it.message }
            }
        }, fullWidth())

        bridgeSpinner = Spinner(this)
        column.addView(bridgeSpinner, fullWidth())

        bridgeNameInput = EditText(this).apply {
            hint = "Bridge-Name, z. B. Zuhause"
            isSingleLine = true
        }
        column.addView(bridgeNameInput, fullWidth())

        bridgeInput = EditText(this).apply {
            hint = "Bridge URL, z. B. https://p4u.example"
            isSingleLine = true
        }
        column.addView(bridgeInput, fullWidth())

        bridgeLocalUrlInput = EditText(this).apply {
            hint = "Lokale Adresse (optional)"
            isSingleLine = true
        }
        column.addView(bridgeLocalUrlInput, fullWidth())

        bridgePublicUrlInput = EditText(this).apply {
            hint = "Public-Adresse (optional)"
            isSingleLine = true
        }
        column.addView(bridgePublicUrlInput, fullWidth())

        val save = Button(this).apply {
            text = "Bridge hinzufügen"
            setOnClickListener {
                runCatching {
                    profiles.upsert(
                        name = bridgeNameInput.text.toString().trim(),
                        baseUrl = bridgeInput.text.toString().trim(),
                        localUrl = bridgeLocalUrlInput.text.toString().trim().takeIf { it.isNotEmpty() },
                        publicUrl = bridgePublicUrlInput.text.toString().trim().takeIf { it.isNotEmpty() },
                    )
                }.onSuccess {
                    profiles.setActive(it.profileId)
                    refreshBridgeProfiles()
                    status.text = "Bridge gespeichert und aktiviert: " + it.name
                }.onFailure { error -> status.text = "Bridge konnte nicht gespeichert werden: " + error.message }
            }
        }
        column.addView(save, fullWidth())

        val activate = Button(this).apply {
            text = "Ausgewählte Bridge aktivieren"
            setOnClickListener {
                val all = profiles.list()
                val selected = all.getOrNull(bridgeSpinner.selectedItemPosition)
                if (selected != null) {
                    profiles.setActive(selected.profileId)
                    bridgeNameInput.setText(selected.name)
                    bridgeInput.setText(selected.baseUrl)
                    bridgeLocalUrlInput.setText(selected.localUrl.orEmpty())
                    bridgePublicUrlInput.setText(selected.publicUrl.orEmpty())
                    status.text = "Aktive Bridge: " + selected.name
                }
            }
        }
        column.addView(activate, fullWidth())
        refreshBridgeProfiles()

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

    private fun refreshBridgeProfiles() {
        val all = profiles.list()
        bridgeSpinner.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, all.map { profile -> if (profile.globalName.isNullOrBlank() || profile.globalName == profile.name) profile.name else profile.name + " · " + profile.globalName })
        val active = profiles.active()
        if (active != null) {
            val index = all.indexOfFirst { it.profileId == active.profileId }
            if (index >= 0) bridgeSpinner.setSelection(index)
            bridgeNameInput.setText(active.name)
            bridgeInput.setText(active.baseUrl)
            bridgeLocalUrlInput.setText(active.localUrl.orEmpty())
            bridgePublicUrlInput.setText(active.publicUrl.orEmpty())
        }
    }

    private fun migrateLegacyBridge() {
        if (profiles.list().isNotEmpty()) return
        val legacy = getSharedPreferences("p4u-scanner", MODE_PRIVATE)
        val url = legacy.getString("bridge-url", null)?.trim().orEmpty()
        if (url.startsWith("https://") || url.startsWith("http://")) {
            profiles.upsert(name = "Bridge", baseUrl = url)
        }
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
        val profile = profiles.active()
        if (profile == null) {
            status.text = "Bitte zuerst eine Bridge hinzufügen und aktivieren."
            return
        }
        val bridge = profile.baseUrl

        checkButton.isEnabled = false
        status.text = "Prüfe Update …"

        executor.execute {
            runCatching {
                val inspector = AndroidPackageInspector(this)
                val installed = inspector.installed()
                val discovery = BridgeDiscoveryClient().discover(bridge)
                if (!discovery.instanceName.isNullOrBlank() && discovery.instanceName != profile.globalName) {
                    profiles.setGlobalName(profile.profileId, discovery.instanceName)
                }
                val releaseClient = BridgeReleaseClient(discovery.xrAppHref)
                val release = releaseClient.latest(profile.updateChannel)

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
