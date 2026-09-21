package at.p4u.picovr.ui

import androidx.compose.runtime.Composable
import at.p4u.picovr.core.feature.FeatureSnapshot
import at.p4u.picovr.ui.hud.HudContribution
import at.p4u.picovr.ui.hud.HudPanelPresentation
import at.p4u.picovr.ui.hud.toHudContribution

// ADR: docs/adr/app/0022-modular-app-foundation-and-features.md — feature-specific presentation plugs into a generic shell rather than the app composition root.
// ADR: docs/adr/app/0029-unified-xr-hud-interaction-shell.md — feature adapters contribute HUD metadata while the shell owns persistent chrome.
interface FeaturePresentation : AutoCloseable {
    val featureId: String

    fun hudContribution(snapshot: FeatureSnapshot): HudContribution =
        snapshot.toHudContribution()

    fun panelPresentation(snapshot: FeatureSnapshot): HudPanelPresentation? =
        null

    fun isContentVisible(snapshot: FeatureSnapshot): Boolean = false

    @Composable
    fun Runtime(
        snapshot: FeatureSnapshot,
        onFeedback: (at.p4u.picovr.ui.hud.HudFeedback) -> Unit,
    ) = Unit

    @Composable
    fun Content(
        snapshot: FeatureSnapshot,
        onFeedback: (at.p4u.picovr.ui.hud.HudFeedback) -> Unit,
    )

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
    }

    fun presentation(featureId: String): FeaturePresentation? =
        presentationsByFeatureId[featureId]

    fun all(): Collection<FeaturePresentation> =
        presentationsByFeatureId.values

    fun contributions(features: List<FeatureSnapshot>): List<HudContribution> =
        features.mapNotNull { snapshot ->
            presentationsByFeatureId[snapshot.id]?.hudContribution(snapshot)
        }

    override fun close() {
        presentationsByFeatureId.values.forEach { runCatching { it.close() } }
    }
}
