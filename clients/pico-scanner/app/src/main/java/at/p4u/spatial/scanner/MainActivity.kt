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
    private lateinit var pairingInput: EditText
    private lateinit var pairButton: Button
    private lateinit var testUploadButton: Button

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

        pairingInput = EditText(this).apply {
            hint = "Pairing-QR JSON hier einfügen"
            minLines = 4
            maxLines = 8
        }
        column.addView(pairingInput, fullWidth())

        pairButton = Button(this).apply {
            text = "Mit Bridge koppeln"
            setOnClickListener { startPairing() }
        }
        column.addView(pairButton, fullWidth())

        testUploadButton = Button(this).apply {
            text = "Testscan hochladen"
            setOnClickListener { uploadTestScan() }
        }
        column.addView(testUploadButton, fullWidth())

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

    private fun startPairing() {
        val raw = pairingInput.text.toString().trim()
        if (raw.isEmpty()) {
            status.text = "Bitte zuerst den Pairing-QR-Inhalt einfügen."
            return
        }

        pairButton.isEnabled = false
        status.text = "Pairing wird gestartet …"
        executor.execute {
            runCatching<String> {
                val client = PairingClient()
                val qr = client.parseQr(raw)
                val resolved = BridgeEndpointResolver().resolveForPairing(qr)
                val existing = profiles.list().firstOrNull { it.instanceId == resolved.discovery.instanceId }
                val profile = profiles.upsert(
                    profileId = existing?.profileId,
                    name = existing?.name ?: resolved.discovery.instanceName ?: "Bridge",
                    baseUrl = resolved.baseUrl,
                    updateChannel = existing?.updateChannel ?: "stable",
                    globalName = resolved.discovery.instanceName,
                    localUrl = qr.localUrl,
                    publicUrl = qr.publicUrl,
                    instanceId = resolved.discovery.instanceId,
                )
                profiles.setActive(profile.profileId)

                val claimId = client.claim(
                    resolved.baseUrl,
                    qr,
                    deviceIdentity.deviceId(),
                    BuildConfig.VERSION_NAME,
                    deviceIdentity.localName(),
                )
                runOnUiThread {
                    status.text = "Pairing wartet auf Freigabe. Claim-ID: $claimId"
                }

                while (true) {
                    when (val poll = client.poll(resolved.baseUrl, claimId)) {
                        PairingPoll.Pending -> Thread.sleep(2_000)
                        PairingPoll.Rejected -> error("Pairing wurde abgelehnt.")
                        PairingPoll.Expired -> error("Pairing ist abgelaufen.")
                        is PairingPoll.Authorized -> {
                            AuthenticatedBridgeClient(
                                resolved.baseUrl,
                                SecureSessionStore(this, profile.profileId),
                            ).acceptBootstrap(poll.session)
                            return@runCatching "Pairing abgeschlossen: ${profile.name}"
                        }
                    }
                }
            }.onSuccess { message ->
                runOnUiThread {
                    refreshBridgeProfiles()
                    status.text = message
                    pairButton.isEnabled = true
                }
            }.onFailure { error ->
                runOnUiThread {
                    status.text = "Pairing fehlgeschlagen: ${error.message}"
                    pairButton.isEnabled = true
                }
            }
        }
    }

    private fun uploadTestScan() {
        val profile = profiles.active()
        if (profile == null) {
            status.text = "Bitte zuerst eine Bridge koppeln."
            return
        }

        testUploadButton.isEnabled = false
        status.text = "Testscan wird vorbereitet …"
        executor.execute {
            runCatching {
                val resolved = BridgeEndpointResolver().resolve(profile)
                if (profile.instanceId == null) {
                    profiles.setAddresses(
                        profile.profileId,
                        profile.localUrl,
                        profile.publicUrl,
                        resolved.discovery.instanceId,
                    )
                }
                val outbox = ScanOutbox(this, profile.profileId)
                val sample = ("{\"t\":\"" + java.time.Instant.now().toString() +
                    "\",\"position\":[0,0,0],\"orientation\":[0,0,0,1],\"tracking\":\"synthetic\"}\n")
                    .toByteArray()
                val scan = outbox.create(
                    deviceId = deviceIdentity.deviceId(),
                    mode = "site",
                    files = mapOf("trajectory.jsonl" to sample),
                    capture = CapturePackage.captureJson(
                        CaptureIntent(
                            purpose = "free-capture",
                            precision = "relative-only",
                            runtimeCapabilities = listOf("synthetic-practical-test"),
                        ),
                    ),
                    capabilities = listOf("synthetic-practical-test"),
                )
                val bridge = AuthenticatedBridgeClient(
                    resolved.baseUrl,
                    SecureSessionStore(this, profile.profileId),
                )
                ScanOutboxUploader(outbox, bridge).upload(scan)
                "Testscan ${scan.scanId} wurde committed."
            }.onSuccess { message ->
                runOnUiThread {
                    status.text = message
                    testUploadButton.isEnabled = true
                }
            }.onFailure { error ->
                runOnUiThread {
                    status.text = "Testscan blieb in der Outbox: ${error.message}"
                    testUploadButton.isEnabled = true
                }
            }
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
