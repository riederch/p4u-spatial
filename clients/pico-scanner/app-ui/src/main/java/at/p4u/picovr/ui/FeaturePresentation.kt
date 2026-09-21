package at.p4u.picovr.ui

import androidx.compose.runtime.Composable
import at.p4u.picovr.core.feature.FeatureSnapshot

// ADR: docs/adr/app/0022-modular-app-foundation-and-features.md — feature-specific presentation plugs into a generic shell rather than the app composition root.
interface FeaturePresentation : AutoCloseable {
    val featureId: String
    val isHomeSurface: Boolean
        get() = false

    @Composable
    fun Content()

    @Composable
    fun StatusIcon(snapshot: FeatureSnapshot)

    override fun close() = Unit
}

class FeaturePresentationRegistry(
    presentations: List<FeaturePresentation>,
) : AutoCloseable {
    private val presentationsByFeatureId = presentations.associateBy { it.featureId }

    init {
        require(presentationsByFeatureId.size == presentations.size) {
            "Feature presentation ids must be unique."
        }
        require(presentations.count { it.isHomeSurface } <= 1) {
            "Only one feature presentation may be the home surface."
        }
    }

    fun presentation(featureId: String): FeaturePresentation? =
        presentationsByFeatureId[featureId]

    fun home(): FeaturePresentation? =
        presentationsByFeatureId.values.firstOrNull { it.isHomeSurface }

    override fun close() {
        presentationsByFeatureId.values.forEach { runCatching { it.close() } }
    }
}
