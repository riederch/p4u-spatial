package at.p4u.picovr.ui.hud

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import com.pico.spatial.ui.design.Button
import com.pico.spatial.ui.design.IconButton
import com.pico.spatial.ui.design.ToggleButton
import com.pico.spatial.ui.design.Slider
import com.pico.spatial.ui.design.SliderDefaults
import com.pico.spatial.ui.design.Text
import com.pico.spatial.ui.foundation.customscoll.rememberSpatialScrollBehavior
import com.pico.spatial.ui.foundation.hover.spatialHoverEffect
import kotlin.math.roundToInt

// ADR: docs/adr/app/0029-unified-xr-hud-interaction-shell.md — all launcher, menu, status, feedback and panel chrome share these primitives.
@Composable
fun HudSurface(
    modifier: Modifier = Modifier,
    panel: Boolean = false,
    content: @Composable () -> Unit,
) {
    val opacity = if (panel) HudTokens.Surface.panelOpacity else HudTokens.Surface.hudOpacity
    val borderOpacity = if (panel) HudTokens.Surface.panelBorderOpacity else HudTokens.Surface.hudBorderOpacity
    val radius = if (panel) HudTokens.Radius.large else HudTokens.Radius.medium

    Box(
        modifier = modifier
            .background(
                color = Color.White.copy(alpha = opacity),
                shape = RoundedCornerShape(radius),
            )
            .border(
                width = 1.dp,
                color = Color.Black.copy(alpha = borderOpacity),
                shape = RoundedCornerShape(radius),
            )
            .padding(HudTokens.Spacing.md),
    ) {
        content()
    }
}

@Composable
fun HudLauncherButton(
    expanded: Boolean,
    onClick: () -> Unit,
    visualScale: Float = 1f,
    modifier: Modifier = Modifier,
) {
    val scale = visualScale.coerceIn(0.5f, 1.5f)
    val visualSize = HudTokens.Icon.launcher * scale

    IconButton(
        onClick = onClick,
        modifier = modifier
            .sizeIn(
                minWidth = HudTokens.HitTarget.minimum,
                minHeight = HudTokens.HitTarget.minimum,
            )
            .spatialHoverEffect(),
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(visualSize)
                .background(
                    Color.White.copy(alpha = HudTokens.Surface.hudOpacity),
                    RoundedCornerShape(HudTokens.Radius.medium),
                )
                .border(
                    1.dp,
                    Color.Black.copy(alpha = HudTokens.Surface.hudBorderOpacity),
                    RoundedCornerShape(HudTokens.Radius.medium),
                ),
        ) {
            Text(
                if (expanded) "×" else "≡",
                textAlign = TextAlign.Center,
                fontSize = (HudTokens.Typography.menuEm * scale).em,
            )
        }
    }
}

@Composable
fun HudNavigationPanel(
    title: String?,
    onBack: (() -> Unit)?,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    HudSurface(
        modifier = modifier,
        panel = true,
    ) {
        Column(
            verticalArrangement = Arrangement.spacedBy(HudTokens.Spacing.sm),
        ) {
            if (title != null || onBack != null) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(HudTokens.Spacing.sm),
                ) {
                    if (onBack != null) {
                        Button(onClick = onBack) {
                            Text("‹", fontSize = HudTokens.Typography.menuEm.em)
                        }
                    }
                    if (title != null) {
                        Text(
                            title,
                            fontSize = HudTokens.Typography.menuEm.em,
                        )
                    }
                }
            }
            content()
        }
    }
}

@Composable
fun HudCategoryRow(
    title: String,
    onClick: () -> Unit,
) {
    Button(onClick = onClick) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(title, fontSize = HudTokens.Typography.menuEm.em)
            Text("›", fontSize = HudTokens.Typography.menuEm.em)
        }
    }
}

@Composable
fun HudToggleRow(
    title: String,
    value: Boolean,
    enabled: Boolean = true,
    onToggle: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = HudTokens.HitTarget.minimum),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(HudTokens.Spacing.sm),
    ) {
        Text(
            title,
            fontSize = HudTokens.Typography.menuEm.em,
            modifier = Modifier.weight(1f),
        )
        ToggleButton(
            checked = value,
            onCheckedChange = onToggle,
            enabled = enabled,
        ) {
            Text(
                if (value) "Ein" else "Aus",
                fontSize = HudTokens.Typography.bodyEm.em,
            )
        }
    }
}

@Composable
fun HudCommandButton(
    command: HudCommand,
    onExecute: (HudCommand) -> Unit,
    modifier: Modifier = Modifier,
) {
    val label = when (command.state.availability) {
        HudCommandAvailability.RUNNING -> "Bitte warten …"
        else -> command.label
    }
    Button(
        onClick = { onExecute(command) },
        enabled = command.state.availability == HudCommandAvailability.ENABLED,
        modifier = modifier.sizeIn(minHeight = HudTokens.HitTarget.minimum),
    ) {
        Text(label, fontSize = HudTokens.Typography.bodyEm.em)
    }
}

@Composable
fun HudStatusContainer(
    title: String,
    level: HudStatusLevel,
    visualScale: Float = 1f,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val scale = visualScale.coerceIn(0.5f, 1.5f)
    val border = when (level) {
        HudStatusLevel.ACTIVE -> Color.Black.copy(alpha = HudTokens.Surface.hudBorderOpacity)
        HudStatusLevel.DEGRADED -> Color(0xFF8A5A00)
        HudStatusLevel.ERROR -> Color(0xFF8A1C1C)
    }

    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier.sizeIn(
            minWidth = HudTokens.HitTarget.minimum,
            minHeight = HudTokens.HitTarget.minimum,
        ),
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(HudTokens.HitTarget.minimum * scale)
                .background(
                    Color.White.copy(alpha = HudTokens.Surface.hudOpacity),
                    RoundedCornerShape(HudTokens.Radius.medium),
                )
                .border(1.dp, border, RoundedCornerShape(HudTokens.Radius.medium))
                .padding(HudTokens.Spacing.xs),
        ) {
            Box(
                modifier = Modifier.graphicsLayer(
                    scaleX = scale,
                    scaleY = scale,
                ),
            ) {
                content()
            }
        }
    }
}

@Composable
fun HudFeedbackSurface(
    feedback: HudFeedback,
    modifier: Modifier = Modifier,
) {
    HudSurface(modifier = modifier) {
        Column(
            verticalArrangement = Arrangement.spacedBy(HudTokens.Spacing.xs),
        ) {
            val prefix = when (feedback.kind) {
                HudFeedbackKind.INFO -> "Info"
                HudFeedbackKind.SUCCESS -> "Erledigt"
                HudFeedbackKind.WARNING -> "Hinweis"
                HudFeedbackKind.ERROR -> "Fehler"
                HudFeedbackKind.RUNNING -> "Läuft"
            }
            Text(
                prefix + " · " + feedback.message,
                fontSize = HudTokens.Typography.bodyEm.em,
            )
            feedback.progress?.let {
                Text(
                    ((it * 100).toInt()).toString() + " %",
                    fontSize = HudTokens.Typography.captionEm.em,
                )
            }
        }
    }
}

@Composable
fun HudResultPanel(
    title: String,
    typeLabel: String?,
    commands: List<HudCommand>,
    onCommand: (HudCommand) -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    HudSurface(
        modifier = modifier,
        panel = true,
    ) {
        Column(
            verticalArrangement = Arrangement.spacedBy(HudTokens.Spacing.md),
        ) {
            Column(
                verticalArrangement = Arrangement.spacedBy(HudTokens.Spacing.xs),
            ) {
                Text(title, fontSize = HudTokens.Typography.titleEm.em)
                typeLabel?.let {
                    Text(it, fontSize = HudTokens.Typography.captionEm.em)
                }
            }

            Column(
                modifier = Modifier.verticalScroll(
                    state = rememberScrollState(),
                    flingBehavior = rememberSpatialScrollBehavior(),
                ),
            ) {
                content()
            }

            if (commands.isNotEmpty()) {
                HudActionDock(
                    commands = commands,
                    onCommand = onCommand,
                )
            }
        }
    }
}

@Composable
fun HudActionDock(
    commands: List<HudCommand>,
    onCommand: (HudCommand) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(HudTokens.Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        commands.forEach { command ->
            HudCommandButton(
                command = command,
                onExecute = onCommand,
            )
        }
    }
}

@Composable
fun HudSliderRow(
    title: String,
    value: Int,
    min: Int,
    max: Int,
    step: Int,
    unitSuffix: String = "",
    onValueChange: (Int) -> Unit,
) {
    val safeRange = (max - min).coerceAtLeast(1)
    val normalized = ((value.coerceIn(min, max) - min).toFloat() / safeRange.toFloat())

    Column(
        verticalArrangement = Arrangement.spacedBy(HudTokens.Spacing.xs),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(title, fontSize = HudTokens.Typography.menuEm.em)
            Text(
                value.coerceIn(min, max).toString() + unitSuffix,
                fontSize = HudTokens.Typography.bodyEm.em,
            )
        }

        Slider(
            value = normalized,
            onValueChange = { raw ->
                val unsnapped = min + raw.coerceIn(0f, 1f) * safeRange
                val snapped = (
                    min + (((unsnapped - min) / step.toFloat()).roundToInt() * step)
                ).coerceIn(min, max)
                onValueChange(snapped)
            },
            sliderSpec = SliderDefaults.Small,
            modifier = Modifier.fillMaxWidth(),
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(min.toString() + unitSuffix, fontSize = HudTokens.Typography.captionEm.em)
            Text(max.toString() + unitSuffix, fontSize = HudTokens.Typography.captionEm.em)
        }
    }
}
