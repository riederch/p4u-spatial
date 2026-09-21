package at.p4u.spatial.scanner

import android.content.Context
import at.p4u.picovr.qr.QrAction
import at.p4u.picovr.qr.QrActionResult
import at.p4u.picovr.qr.QrResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

// ADR: docs/adr/app/0019-reusable-qr-reader-feature.md — Bridge registration is a custom action, not scanner-core behavior.
class BridgeRegistrationQrAction(
    private val pairingClient: PairingClient = PairingClient(),
    private val endpointResolver: BridgeEndpointResolver = BridgeEndpointResolver(),
) : QrAction {
    override val id = "bridge.register"
    override val title = "Bridge registrieren"

    override fun matches(result: QrResult): Boolean =
        runCatching { pairingClient.parseQr(result.raw) }.isSuccess

    override suspend fun execute(context: Context, result: QrResult): QrActionResult =
        withContext(Dispatchers.IO) {
            runCatching {
                val qr = pairingClient.parseQr(result.raw)
                val resolved = endpointResolver.resolveForPairing(qr)
                val identity = DeviceIdentityStore(context)
                val claimId = pairingClient.claim(
                    resolved.baseUrl,
                    qr,
                    identity.deviceId(),
                    BuildConfig.VERSION_NAME,
                    identity.localName(),
                )

                var authorized: BootstrapSession? = null
                while (authorized == null) {
                    when (val poll = pairingClient.poll(resolved.baseUrl, claimId)) {
                        PairingPoll.Pending -> delay(POLL_INTERVAL_MS)
                        PairingPoll.Rejected -> error("Bridge-Registrierung wurde abgelehnt.")
                        PairingPoll.Expired -> error("Bridge-Registrierung ist abgelaufen.")
                        is PairingPoll.Authorized -> authorized = poll.session
                    }
                }

                val profileStore = BridgeProfileStore(context)
                val profile = profileStore.upsert(
                    name = resolved.discovery.instanceName ?: qr.bridge,
                    baseUrl = resolved.baseUrl,
                    globalName = resolved.discovery.instanceName,
                    localUrl = qr.localUrl,
                    publicUrl = qr.publicUrl,
                    instanceId = resolved.discovery.instanceId,
                )
                profileStore.setActive(profile.profileId)
                SecureSessionStore(context, profile.profileId).save(
                    authorized.refreshToken,
                    authorized.refreshExpiresAt,
                )
                QrActionResult.Success("Bridge erfolgreich registriert.")
            }.getOrElse {
                QrActionResult.Failure(it.message ?: "Bridge konnte nicht registriert werden.")
            }
        }

    companion object {
        private const val POLL_INTERVAL_MS = 1_000L
    }
}
