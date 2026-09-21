package at.p4u.picovr.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.em
import at.p4u.picovr.core.feature.FeatureSnapshot
import at.p4u.picovr.ui.hud.HudCategoryRow
import at.p4u.picovr.ui.hud.HudCommandButton
import at.p4u.picovr.ui.hud.HudContribution
import at.p4u.picovr.ui.hud.HudFeedback
import at.p4u.picovr.ui.hud.HudFeedbackKind
import at.p4u.picovr.ui.hud.HudFeedbackSurface
import at.p4u.picovr.ui.hud.HudLauncherButton
import at.p4u.picovr.ui.hud.HudMenuContribution
import at.p4u.picovr.ui.hud.HudMenuControl
import at.p4u.picovr.ui.hud.HudNavigationPanel
import at.p4u.picovr.ui.hud.HudSettings
import at.p4u.picovr.ui.hud.HudSettingsStore
import at.p4u.picovr.ui.hud.HudSliderRow
import at.p4u.picovr.ui.hud.HudStatusContainer
import at.p4u.picovr.ui.hud.HudStatusContribution
import at.p4u.picovr.ui.hud.HudTokens
import at.p4u.picovr.ui.hud.HudToggleRow
import at.p4u.picovr.ui.hud.asContribution
import com.pico.spatial.ui.design.PicoTheme
import com.pico.spatial.ui.design.Text
import com.pico.spatial.ui.design.defaultColorScheme
import com.pico.spatial.ui.foundation.geometry.NormalizedPoint3D
import com.pico.spatial.ui.foundation.material.backgroundMaterial
import com.pico.spatial.ui.foundation.window.Augment
import com.pico.spatial.ui.foundation.window.AugmentContentAlignment
import com.pico.spatial.ui.platform.ViewPoint
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// ADR: docs/adr/app/0022-modular-app-foundation-and-features.md — shell renders generic feature presentations without importing feature-specific types.
// ADR: docs/adr/app/0029-unified-xr-hud-interaction-shell.md — navigation and status are rendered from declarative HUD contributions and one shared visual system.
@Composable
fun PicoFeatureShell(
    features: List<FeatureSnapshot>,
    presentations: FeaturePresentationRegistry,
    onFeatureEnabledChange: (featureId: String, enabled: Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val settingsStore = remember(context) { HudSettingsStore(context) }
    var hudSettings by remember { mutableStateOf(settingsStore.load()) }
    val contributions = presentations.contributions(features) + hudSettings.asContribution()
    val peripheralScale = hudSettings.normalizedPeripheralHudScalePercent / 100f
    var feedback by remember { mutableStateOf<HudFeedback?>(null) }

    LaunchedEffect(feedback) {
        val current = feedback ?: return@LaunchedEffect
        if (!current.persistent && current.kind != HudFeedbackKind.RUNNING) {
            delay(2500)
            if (feedback == current) feedback = null
        }
    }

    PicoTheme(colorScheme = defaultColorScheme()) {
        Box(
            modifier = modifier
                .backgroundMaterial(true)
                .background(Color.LightGray),
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier,
            ) {
                Text("picoVr", textAlign = TextAlign.Center, fontSize = HudTokens.Typography.heroEm.em)
                presentations.home()?.let { presentation ->
                    features.firstOrNull { it.id == presentation.featureId }?.let { snapshot ->
                        presentation.Content(snapshot) { feedback = it }
                    }
                }
            }
        }

        Augment(
            anchor = NormalizedPoint3D(0.08f, 0.96f, 0f),
            alignment = AugmentContentAlignment.BottomCenter,
            followViewpoints = ViewPoint.All,
            enableMaterialBackground = false,
            focusable = true,
        ) {
            UnifiedHudMenu(
                contributions = contributions,
                onFeatureEnabledChange = onFeatureEnabledChange,
                onSettingChange = { key, value ->
                    if (key == "peripheralHudScalePercent") {
                        hudSettings = settingsStore.save(
                            hudSettings.copy(peripheralHudScalePercent = value),
                        )
                    }
                },
                onFeedback = { feedback = it },
                peripheralScale = peripheralScale,
            )
        }

        feedback?.let { currentFeedback ->
            Augment(
                anchor = NormalizedPoint3D(0.5f, 0.94f, 0f),
                alignment = AugmentContentAlignment.BottomCenter,
                followViewpoints = ViewPoint.All,
                enableMaterialBackground = false,
                focusable = false,
            ) {
                HudFeedbackSurface(currentFeedback)
            }
        }

        Augment(
            anchor = NormalizedPoint3D(0.94f, 0.78f, 0f),
            alignment = AugmentContentAlignment.BottomCenter,
            followViewpoints = ViewPoint.All,
            enableMaterialBackground = false,
            focusable = false,
        ) {
            UnifiedStatusRail(
                features = features,
                contributions = contributions,
                presentations = presentations,
                peripheralScale = peripheralScale,
            )
        }
    }
}

private data class HudMenuNode(
    val name: String,
    val children: Map<String, HudMenuNode>,
    val items: List<HudMenuContribution>,
)

private fun buildHudMenuTree(contributions: List<HudContribution>): HudMenuNode {
    class MutableNode(val name: String) {
        val children = linkedMapOf<String, MutableNode>()
        val items = mutableListOf<HudMenuContribution>()
    }

    val root = MutableNode("")
    contributions
        .flatMap { it.menu }
        .forEach { item ->
            var node = root
            item.path.forEach { segment ->
                node = node.children.getOrPut(segment) { MutableNode(segment) }
            }
            node.items += item
        }

    fun freeze(node: MutableNode): HudMenuNode =
        HudMenuNode(
            name = node.name,
            children = node.children.mapValues { freeze(it.value) },
            items = node.items.toList(),
        )

    return freeze(root)
}

private fun HudMenuNode.resolve(path: List<String>): HudMenuNode? {
    var node = this
    path.forEach { segment ->
        node = node.children[segment] ?: return null
    }
    return node
}

@Composable
private fun UnifiedHudMenu(
    contributions: List<HudContribution>,
    onFeatureEnabledChange: (featureId: String, enabled: Boolean) -> Unit,
    onSettingChange: (key: String, value: Int) -> Unit,
    onFeedback: (HudFeedback) -> Unit,
    peripheralScale: Float,
    modifier: Modifier = Modifier,
) {
    var open by remember { mutableStateOf(false) }
    var path by remember { mutableStateOf(emptyList<String>()) }
    val scope = rememberCoroutineScope()
    val tree = remember(contributions) { buildHudMenuTree(contributions) }
    val node = tree.resolve(path) ?: tree

    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.Start,
        verticalArrangement = Arrangement.spacedBy(HudTokens.Spacing.sm),
    ) {
        if (open) {
            HudNavigationPanel(
                title = path.lastOrNull() ?: "picoVr",
                onBack = if (path.isNotEmpty()) {
                    { path = path.dropLast(1) }
                } else {
                    null
                },
            ) {
                node.children.values.forEach { child ->
                    HudCategoryRow(
                        title = child.name,
                        onClick = { path = path + child.name },
                    )
                }

                node.items.forEach { item ->
                    when (val control = item.control) {
                        is HudMenuControl.FeatureToggle ->
                            HudToggleRow(
                                title = item.title,
                                value = control.value,
                                enabled = control.enabled,
                                onToggle = { enabled ->
                                    onFeatureEnabledChange(control.featureId, enabled)
                                },
                            )

                        is HudMenuControl.Command ->
                            HudCommandButton(
                                command = control.command,
                                onExecute = { command ->
                                    scope.launch {
                                        onFeedback(
                                            HudFeedback(
                                                kind = HudFeedbackKind.RUNNING,
                                                message = command.label,
                                                persistent = true,
                                            ),
                                        )
                                        command.execute().feedback?.let(onFeedback)
                                    }
                                },
                            )

                        is HudMenuControl.RangeSetting ->
                            HudSliderRow(
                                title = item.title,
                                value = control.value,
                                min = control.min,
                                max = control.max,
                                step = control.step,
                                unitSuffix = control.unitSuffix,
                                onValueChange = { value ->
                                    onSettingChange(control.key, value)
                                },
                            )

                        null ->
                            Text(
                                item.title,
                                fontSize = HudTokens.Typography.menuEm.em,
                            )
                    }
                }

                if (node.children.isEmpty() && node.items.isEmpty()) {
                    Text(
                        "Keine Einträge",
                        fontSize = HudTokens.Typography.bodyEm.em,
                    )
                }
            }
        }

        HudLauncherButton(
            expanded = open,
            visualScale = peripheralScale,
            onClick = {
                open = !open
                if (!open) path = emptyList()
            },
        )
    }
}

private data class HudStatusEntry(
    val featureId: String,
    val status: HudStatusContribution,
)

@Composable
private fun UnifiedStatusRail(
    features: List<FeatureSnapshot>,
    contributions: List<HudContribution>,
    presentations: FeaturePresentationRegistry,
    peripheralScale: Float,
    modifier: Modifier = Modifier,
) {
    val statuses = contributions.flatMap { contribution ->
        contribution.status
            .filter { it.visible }
            .map { status ->
                HudStatusEntry(
                    featureId = contribution.featureId,
                    status = status,
                )
            }
    }

    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(HudTokens.Spacing.sm),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        statuses.forEach { entry ->
            val snapshot = features.firstOrNull { it.id == entry.featureId }
            val presentation = presentations.presentation(entry.featureId)

            HudStatusContainer(
                title = entry.status.title,
                level = entry.status.level,
                visualScale = peripheralScale,
            ) {
                if (snapshot != null && presentation != null) {
                    presentation.StatusIcon(snapshot)
                } else {
                    Text(
                        entry.status.title.take(2).uppercase(),
                        fontSize = HudTokens.Typography.captionEm.em,
                    )
                }
            }
        }
    }
}
