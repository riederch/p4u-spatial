package at.p4u.picovr.core.feature

// ADR: docs/adr/app/0022-modular-app-foundation-and-features.md — the base system owns discovery/state aggregation, concrete features own behavior.
class FeatureRegistry(
    features: List<AppFeature>,
) : AutoCloseable {
    private val featuresById = features.associateBy { it.id }
    private val listeners = linkedSetOf<(List<FeatureSnapshot>) -> Unit>()
    private val subscriptions = mutableListOf<AutoCloseable>()
    private var currentSnapshots = features.map { it.snapshot() }

    init {
        require(featuresById.size == features.size) {
            "Feature ids must be unique."
        }
        features.forEach { feature ->
            subscriptions += feature.observe {
                refresh()
            }
        }
    }

    fun snapshots(): List<FeatureSnapshot> = currentSnapshots

    fun observe(listener: (List<FeatureSnapshot>) -> Unit): AutoCloseable {
        listeners += listener
        listener(currentSnapshots)
        return AutoCloseable {
            listeners -= listener
        }
    }

    fun setEnabled(featureId: String, enabled: Boolean) {
        val feature = featuresById[featureId]
            ?: error("Unknown feature '$featureId'.")
        require(feature.toggleable) {
            "Feature '$featureId' is not toggleable."
        }
        feature.setEnabled(enabled)
    }

    private fun refresh() {
        currentSnapshots = featuresById.values.map { it.snapshot() }
        listeners.toList().forEach { it(currentSnapshots) }
    }

    override fun close() {
        subscriptions.forEach { runCatching { it.close() } }
        subscriptions.clear()
        listeners.clear()
    }
}
