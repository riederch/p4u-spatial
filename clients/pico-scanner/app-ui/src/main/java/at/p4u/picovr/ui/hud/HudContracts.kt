package at.p4u.picovr.ui.hud

import androidx.compose.runtime.Composable
import at.p4u.picovr.core.feature.FeatureSnapshot

// ADR: docs/adr/app/0029-unified-xr-hud-interaction-shell.md — features contribute declarative HUD state; the HUD owns persistent control chrome.
data class HudContribution(
    val featureId: String,
    val menu: List<HudMenuContribution> = emptyList(),
    val status: List<HudStatusContribution> = emptyList(),
    val commands: List<HudCommand> = emptyList(),
)

data class HudMenuContribution(
    val id: String,
    val title: String,
    val path: List<String> = emptyList(),
    val control: HudMenuControl? = null,
)

sealed interface HudMenuControl {
    data class FeatureToggle(
        val featureId: String,
        val value: Boolean,
        val enabled: Boolean = true,
    ) : HudMenuControl

    data class Command(
        val command: HudCommand,
    ) : HudMenuControl

    data class RangeSetting(
        val key: String,
        val value: Int,
        val min: Int,
        val max: Int,
        val step: Int,
        val unitSuffix: String = "",
    ) : HudMenuControl
}

enum class HudStatusLevel {
    ACTIVE,
    DEGRADED,
    ERROR,
}

data class HudStatusContribution(
    val id: String,
    val title: String,
    val iconKey: String,
    val level: HudStatusLevel = HudStatusLevel.ACTIVE,
    val visible: Boolean = true,
)

enum class HudCommandRole {
    PRIMARY,
    SECONDARY,
    DESTRUCTIVE,
    PASSIVE,
}

enum class HudCommandAvailability {
    ENABLED,
    DISABLED,
    RUNNING,
}

data class HudCommandState(
    val availability: HudCommandAvailability = HudCommandAvailability.ENABLED,
    val progress: Float? = null,
) {
    init {
        require(progress == null || progress in 0f..1f) {
            "HUD command progress must be between 0 and 1."
        }
    }
}

interface HudCommand {
    val id: String
    val label: String
    val role: HudCommandRole
        get() = HudCommandRole.SECONDARY
    val state: HudCommandState
        get() = HudCommandState()

    suspend fun execute(): HudCommandResult
}

data class HudCommandResult(
    val feedback: HudFeedback? = null,
)

enum class HudFeedbackKind {
    INFO,
    SUCCESS,
    WARNING,
    ERROR,
    RUNNING,
}

data class HudFeedback(
    val kind: HudFeedbackKind,
    val message: String,
    val progress: Float? = null,
    val persistent: Boolean = kind == HudFeedbackKind.ERROR,
) {
    init {
        require(progress == null || progress in 0f..1f) {
            "HUD feedback progress must be between 0 and 1."
        }
    }
}

interface HudPanelPresentation {
    val id: String
    val title: String
    val typeLabel: String?
        get() = null
    val commands: List<HudCommand>
        get() = emptyList()

    @Composable
    fun Content()
}

data class HudSettings(
    val peripheralHudScalePercent: Int = DEFAULT_SCALE_PERCENT,
) {
    val normalizedPeripheralHudScalePercent: Int
        get() = peripheralHudScalePercent
            .coerceIn(MIN_SCALE_PERCENT, MAX_SCALE_PERCENT)
            .let { value ->
                val offset = value - MIN_SCALE_PERCENT
                MIN_SCALE_PERCENT + (offset / SCALE_STEP_PERCENT) * SCALE_STEP_PERCENT
            }

    companion object {
        const val MIN_SCALE_PERCENT = 50
        const val DEFAULT_SCALE_PERCENT = 100
        const val MAX_SCALE_PERCENT = 150
        const val SCALE_STEP_PERCENT = 5
    }
}

fun FeatureSnapshot.toHudContribution(): HudContribution {
    val menu = if (menuPath.isNotEmpty() || toggleable) {
        listOf(
            HudMenuContribution(
                id = "feature:$id",
                title = title,
                path = menuPath,
                control = if (toggleable) {
                    HudMenuControl.FeatureToggle(
                        featureId = id,
                        value = enabled,
                    )
                } else {
                    null
                },
            ),
        )
    } else {
        emptyList()
    }

    val iconKey = statusIconKey
    val status = if (enabled && iconKey != null) {
        listOf(
            HudStatusContribution(
                id = "feature:$id",
                title = title,
                iconKey = iconKey,
            ),
        )
    } else {
        emptyList()
    }

    return HudContribution(
        featureId = id,
        menu = menu,
        status = status,
    )
}

class LambdaHudCommand(
    override val id: String,
    override val label: String,
    override val role: HudCommandRole = HudCommandRole.SECONDARY,
    override val state: HudCommandState = HudCommandState(),
    private val action: suspend () -> HudCommandResult,
) : HudCommand {
    override suspend fun execute(): HudCommandResult = action()
}

fun HudSettings.asContribution(): HudContribution =
    HudContribution(
        featureId = "system.hud",
        menu = listOf(
            HudMenuContribution(
                id = "system.hud.scale",
                title = "HUD-Größe",
                path = listOf("System", "Anzeige"),
                control = HudMenuControl.RangeSetting(
                    key = "peripheralHudScalePercent",
                    value = normalizedPeripheralHudScalePercent,
                    min = MIN_SCALE_PERCENT,
                    max = MAX_SCALE_PERCENT,
                    step = SCALE_STEP_PERCENT,
                    unitSuffix = "%",
                ),
            ),
        ),
    )
