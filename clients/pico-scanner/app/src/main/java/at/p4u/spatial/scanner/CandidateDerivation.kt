package at.p4u.spatial.scanner

import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.time.Instant

data class EvidenceRef(
    val path: String,
    val evidenceId: String? = null,
)

data class DerivedCandidate(
    val candidateId: String,
    val scanId: String,
    val profile: String,
    val kind: String,
    val confidence: Double,
    val evidence: List<EvidenceRef>,
    val proposal: JSONObject,
)

// ADR: docs/adr/contracts/0026-derived-candidate-review-and-promotion.md — derivation produces non-canonical, provenance-bearing candidates for explicit review.
object CandidateDerivation {
    private val kinds = setOf("room", "wall", "door", "window", "asset", "landmark")

    fun candidate(
        scanId: String,
        profile: String,
        kind: String,
        confidence: Double,
        evidence: List<EvidenceRef>,
        proposal: JSONObject,
    ): DerivedCandidate {
        require(kind in kinds)
        require(confidence in 0.0..1.0)
        require(evidence.isNotEmpty())

        val evidenceKey = evidence
            .sortedWith(compareBy<EvidenceRef> { it.path }.thenBy { it.evidenceId.orEmpty() })
            .joinToString("|") { "${it.path}#${it.evidenceId.orEmpty()}" }
        val digest = sha256("$scanId\n$profile\n$kind\n$evidenceKey").take(24)

        return DerivedCandidate(
            candidateId = "candidate:$digest",
            scanId = scanId,
            profile = profile,
            kind = kind,
            confidence = confidence,
            evidence = evidence,
            proposal = proposal,
        )
    }

    fun toJson(candidate: DerivedCandidate): JSONObject =
        JSONObject()
            .put("candidateId", candidate.candidateId)
            .put("scanId", candidate.scanId)
            .put("profile", candidate.profile)
            .put("kind", candidate.kind)
            .put("confidence", candidate.confidence)
            .put("evidence", JSONArray(candidate.evidence.map { evidence ->
                JSONObject()
                    .put("scanId", candidate.scanId)
                    .put("path", evidence.path)
                    .also { item -> evidence.evidenceId?.let { item.put("evidenceId", it) } }
            }))
            .put("proposal", candidate.proposal)
            .put("review", JSONObject().put("state", "pending"))

    private fun sha256(value: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray())
            .joinToString("") { "%02x".format(it) }
}

data class CandidateReview(
    val candidateId: String,
    val decision: String,
    val reviewer: String,
    val note: String? = null,
    val sourceId: String? = null,
    val objectId: String? = null,
    val payload: JSONObject? = null,
)

object CandidatePromotion {
    fun reviewJson(review: CandidateReview): JSONObject {
        require(review.decision in setOf("accepted", "rejected", "edited"))
        require((review.sourceId == null) == (review.objectId == null))
        if (review.decision == "edited") require(review.payload != null)

        return JSONObject()
            .put("candidateId", review.candidateId)
            .put("decision", review.decision)
            .put("reviewer", review.reviewer)
            .put("reviewedAt", Instant.now().toString())
            .also { json ->
                review.note?.let { json.put("note", it) }
                if (review.sourceId != null && review.objectId != null) {
                    json.put("target", JSONObject()
                        .put("sourceId", review.sourceId)
                        .put("objectId", review.objectId))
                }
                review.payload?.let { json.put("payload", it) }
            }
    }

    fun spatialOperationDraft(
        candidate: DerivedCandidate,
        review: CandidateReview,
        sourceId: String,
        newObjectId: String? = null,
    ): JSONObject {
        require(review.decision == "accepted" || review.decision == "edited") {
            "Only accepted or edited candidates can produce an operation draft"
        }

        val payload = review.payload ?: candidate.proposal
        val existingTarget = review.objectId
        val objectId = existingTarget ?: requireNotNull(newObjectId) {
            "New canonical objects require an explicitly allocated objectId"
        }

        return JSONObject()
            .put("draft", true)
            .put("sourceId", sourceId)
            .put("action", if (existingTarget == null) "create" else "update")
            .put("objectId", objectId)
            .put("payload", payload)
            .put("provenance", JSONObject()
                .put("scanId", candidate.scanId)
                .put("candidateId", candidate.candidateId)
                .put("derivationProfile", candidate.profile))
    }
}
