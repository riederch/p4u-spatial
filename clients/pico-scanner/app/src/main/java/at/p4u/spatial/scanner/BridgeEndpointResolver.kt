package at.p4u.spatial.scanner

data class ResolvedBridge(
    val baseUrl: String,
    val discovery: BridgeDiscovery,
)

class BridgeEndpointResolver(
    private val discoveryClient: BridgeDiscoveryClient = BridgeDiscoveryClient(),
) {
    fun resolveForPairing(qr: PairingQr): ResolvedBridge {
        val identityCandidates = listOf(qr.bridge, qr.publicUrl, qr.localUrl)
            .filterNotNull()
            .map(::normalize)
            .distinct()

        var identity: BridgeDiscovery? = null
        for (candidate in identityCandidates) {
            val result = runCatching { discoveryClient.discover(candidate) }.getOrNull()
            if (result != null) {
                identity = result
                break
            }
        }
        require(identity != null) { "Keine Bridge-Adresse aus dem Pairing-QR ist erreichbar." }

        val preferredCandidates = listOf(qr.localUrl, qr.publicUrl, qr.bridge)
            .filterNotNull()
            .map(::normalize)
            .distinct()

        for (candidate in preferredCandidates) {
            val result = runCatching { discoveryClient.discover(candidate) }.getOrNull() ?: continue
            require(result.instanceId == identity.instanceId) {
                "Bridge-Adresse $candidate gehört zu einer anderen Instanz."
            }
            return ResolvedBridge(candidate, result)
        }
        error("Keine gültige Bridge-Adresse gefunden.")
    }

    fun resolve(profile: BridgeProfile): ResolvedBridge {
        val candidates = listOf(profile.localUrl, profile.publicUrl, profile.baseUrl)
            .filterNotNull()
            .map(::normalize)
            .distinct()

        var firstReachable: ResolvedBridge? = null
        for (candidate in candidates) {
            val result = runCatching { discoveryClient.discover(candidate) }.getOrNull() ?: continue
            if (profile.instanceId != null) {
                require(result.instanceId == profile.instanceId) {
                    "Bridge-Adresse $candidate gehört nicht zur gespeicherten Instanz."
                }
            }
            val resolved = ResolvedBridge(candidate, result)
            if (profile.instanceId != null || firstReachable == null) return resolved
            firstReachable = resolved
        }
        return firstReachable ?: error("Keine Adresse der Bridge ist erreichbar.")
    }

    private fun normalize(value: String): String = value.trim().trimEnd('/')
}
