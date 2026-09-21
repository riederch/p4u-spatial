package at.p4u.picovr.ui.hud

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

// ADR: docs/adr/app/0029-unified-xr-hud-interaction-shell.md — one semantic token system defines all persistent HUD chrome.
object HudTokens {
    object Surface {
        const val hudOpacity = 0.78f
        const val panelOpacity = 0.90f
        const val feedbackOpacity = 0.88f
        const val hudBorderOpacity = 0.34f
        const val panelBorderOpacity = 0.42f
    }

    object Radius {
        val small: Dp = 12.dp
        val medium: Dp = 18.dp
        val large: Dp = 24.dp
        val pill: Dp = 999.dp
    }

    object Spacing {
        val xs: Dp = 8.dp
        val sm: Dp = 12.dp
        val md: Dp = 20.dp
        val lg: Dp = 28.dp
        val xl: Dp = 40.dp
    }

    object Icon {
        val launcher: Dp = 48.dp
        val status: Dp = 40.dp
        val action: Dp = 32.dp
    }

    object HitTarget {
        val minimum: Dp = 52.dp
        val preferred: Dp = 60.dp
    }

    object Typography {
        const val captionEm = 1.8f
        const val bodyEm = 2.2f
        const val menuEm = 2.4f
        const val titleEm = 3.0f
        const val heroEm = 3.8f
    }

    object Animation {
        const val fastMs = 120
        const val normalMs = 180
        const val slowMs = 260
    }

    object Scale {
        const val minPercent = HudSettings.MIN_SCALE_PERCENT
        const val defaultPercent = HudSettings.DEFAULT_SCALE_PERCENT
        const val maxPercent = HudSettings.MAX_SCALE_PERCENT
        const val stepPercent = HudSettings.SCALE_STEP_PERCENT
    }
}
