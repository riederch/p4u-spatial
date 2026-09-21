package at.p4u.picovr.ui

import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.ui.unit.em
import at.p4u.picovr.core.feature.FeatureSnapshot
import at.p4u.picovr.ui.hud.HudCategoryRow
import at.p4u.picovr.ui.hud.HudCommandButton
import at.p4u.picovr.ui.hud.HudContribution
import at.p4u.picovr.ui.hud.HudFeedback
import at.p4u.picovr.ui.hud.HudFeedbackKind
import at.p4u.picovr.ui.hud.HudFeedbackSurface
import at.p4u.picovr.ui.hud.HudLauncherButton
import at.p4u.picovr.ui.hud.HudMenuControl
import at.p4u.picovr.ui.hud.HudNavigationPanel
import at.p4u.picovr.ui.hud.HudSettingsStore
import at.p4u.picovr.ui.hud.HudSliderRow
import at.p4u.picovr.ui.hud.HudStatusContainer
import at.p4u.picovr.ui.hud.HudStatusContribution
import at.p4u.picovr.ui.hud.HudTokens
import at.p4u.picovr.ui.hud.HudToggleRow
import at.p4u.picovr.ui.hud.asContribution
import at.p4u.picovr.ui.hud.buildHudMenuTree
import at.p4u.picovr.ui.hud.resolve
import com.pico.spatial.core.container.SpatialViewContent
import com.pico.spatial.core.ecs.AnchorComponent
import com.pico.spatial.core.ecs.AnchorEntity
import com.pico.spatial.core.ecs.Entity
import com.pico.spatial.core.ecs.TransformComponent
import com.pico.spatial.core.ecs.anchor.AnchorTarget
import com.pico.spatial.core.math.Vector3
import com.pico.spatial.tracking.hmd.HMDTrackingProvider
import com.pico.spatial.ui.design.PicoTheme
import com.pico.spatial.ui.design.Text
import com.pico.spatial.ui.design.defaultColorScheme
import com.pico.spatial.ui.foundation.content.SpatialView
import com.pico.spatial.ui.foundation.content.SpatialViewAttachments
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// ADR: docs/adr/app/0022-modular-app-foundation-and-features.md — shell renders generic feature presentations without importing feature-specific types.
// ADR: docs/adr/app/0029-unified-xr-hud-interaction-shell.md — persistent HUD chrome is camera/head locked while working content is placed in world space.
@Composable
fun PicoFeatureShell(
    features: List<FeatureSnapshot>,
    presentations: FeaturePresentationRegistry,
    onFeatureEnabledChange: (featureId: String, enabled: Boolean) -> Unit,
) {
    val context = LocalContext.current
    val settingsStore = remember(context) { HudSettingsStore(context) }
    var hudSettings by remember { mutableStateOf(settingsStore.load()) }
    val contributions = presentations.contributions(features) + hudSettings.asContribution()
    val peripheralScale = hudSettings.normalizedPeripheralHudScalePercent / 100f
    var feedback by remember { mutableStateOf<HudFeedback?>(null) }

    val hmdTrackingProvider = remember { HMDTrackingProvider() }
    val cameraTarget =
        remember {
            AnchorEntity(AnchorTarget.createCameraTarget()).apply {
                setName(ENTITY_CAMERA_HUD)
                components[AnchorComponent::class.java]?.positionOffset = HUD_CAMERA_OFFSET
            }
        }
    val contentRoots =
        remember(presentations) {
            presentations.all().associate { presentation ->
                presentation.featureId to
                    Entity().apply {
                        setName("content:" + presentation.featureId)
                    }
            }
        }
    val contentPlaced = remember(presentations) { mutableMapOf<String, Boolean>() }

    LaunchedEffect(Unit) {
        hmdTrackingProvider.start()
        try {
            awaitCancellation()
        } finally {
            hmdTrackingProvider.stop()
        }
    }

    LaunchedEffect(feedback) {
        val current = feedback ?: return@LaunchedEffect
        if (!current.persistent && current.kind != HudFeedbackKind.RUNNING) {
            delay(2500)
            if (feedback == current) feedback = null
        }
    }

    PicoTheme(colorScheme = defaultColorScheme()) {
        presentations.all().forEach { presentation ->
            features.firstOrNull { it.id == presentation.featureId }?.let { snapshot ->
                presentation.Runtime(snapshot) { feedback = it }
            }
        }

        val contentVisibility =
            presentations.all().associate { presentation ->
                val snapshot = features.firstOrNull { it.id == presentation.featureId }
                presentation.featureId to
                    (snapshot != null && presentation.isContentVisible(snapshot))
            }

        SpatialView(
            attachments = {
                AttachmentPanel(id = ATTACHMENT_HUD_MENU) {
                    UnifiedHudMenu(
                        contributions = contributions,
                        onFeatureEnabledChange = onFeatureEnabledChange,
                        onSettingChange = { key, value ->
                            if (key == "peripheralHudScalePercent") {
                                hudSettings =
                                    settingsStore.save(
                                        hudSettings.copy(peripheralHudScalePercent = value),
                                    )
                            }
                        },
                        onFeedback = { feedback = it },
                        peripheralScale = peripheralScale,
                    )
                }

                AttachmentPanel(id = ATTACHMENT_HUD_FEEDBACK) {
                    feedback?.let { HudFeedbackSurface(it) }
                }

                AttachmentPanel(id = ATTACHMENT_HUD_STATUS) {
                    UnifiedStatusRail(
                        features = features,
                        contributions = contributions,
                        presentations = presentations,
                        peripheralScale = peripheralScale,
                    )
                }

                presentations.all().forEach { presentation ->
                    AttachmentPanel(id = contentAttachmentId(presentation.featureId)) {
                        features.firstOrNull { it.id == presentation.featureId }?.let { snapshot ->
                            presentation.Content(snapshot) { feedback = it }
                        }
                    }
                }
            },
            initial = { content, attachments ->
                setupHudScene(
                    content = content,
                    attachments = attachments,
                    cameraTarget = cameraTarget,
                    contentRoots = contentRoots,
                )
            },
            update = { _, _ ->
                contentRoots.forEach { (featureId, root) ->
                    val visible = contentVisibility[featureId] == true
                    if (!visible) {
                        contentPlaced[featureId] = false
                        return@forEach
                    }
                    if (contentPlaced[featureId] == true) return@forEach

                    hmdTrackingProvider.latestData?.hmdPose?.let { pose ->
                        val forward = pose.rotation.rotateVector(Vector3(0f, 0f, -1f))
                        root.components[TransformComponent::class.java]?.apply {
                            position =
                                pose.position +
                                    forward * RESULT_DISTANCE_METERS +
                                    Vector3(0f, RESULT_VERTICAL_OFFSET_METERS, 0f)
                            quaternion = pose.rotation
                        }
                        contentPlaced[featureId] = true
                    }
                }
            },
        )
    }
}

private fun setupHudScene(
    content: SpatialViewContent,
    attachments: SpatialViewAttachments,
    cameraTarget: AnchorEntity,
    contentRoots: Map<String, Entity>,
) {
    attachments.entity(ATTACHMENT_HUD_MENU)?.let { entity ->
        entity.setName(ATTACHMENT_HUD_MENU)
        entity.components[TransformComponent::class.java]?.position = HUD_MENU_POSITION
        cameraTarget.addChild(entity)
    }

    attachments.entity(ATTACHMENT_HUD_FEEDBACK)?.let { entity ->
        entity.setName(ATTACHMENT_HUD_FEEDBACK)
        entity.components[TransformComponent::class.java]?.position = HUD_FEEDBACK_POSITION
        cameraTarget.addChild(entity)
    }

    attachments.entity(ATTACHMENT_HUD_STATUS)?.let { entity ->
        entity.setName(ATTACHMENT_HUD_STATUS)
        entity.components[TransformComponent::class.java]?.position = HUD_STATUS_POSITION
        cameraTarget.addChild(entity)
    }

    content.addEntity(cameraTarget)

    contentRoots.forEach { (featureId, root) ->
        attachments.entity(contentAttachmentId(featureId))?.let { panel ->
            panel.setName(contentAttachmentId(featureId))
            root.addChild(panel)
        }
        content.addEntity(root)
    }
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
                onBack =
                    if (path.isNotEmpty()) {
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
    val statuses =
        contributions.flatMap { contribution ->
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

private fun contentAttachmentId(featureId: String): String = "content:$featureId"

private const val ENTITY_CAMERA_HUD = "hud-camera-anchor"
private const val ATTACHMENT_HUD_MENU = "hud-menu"
private const val ATTACHMENT_HUD_FEEDBACK = "hud-feedback"
private const val ATTACHMENT_HUD_STATUS = "hud-status"

private val HUD_CAMERA_OFFSET = Vector3(0f, 0f, -0.72f)
private val HUD_MENU_POSITION = Vector3(-0.42f, -0.26f, 0f)
private val HUD_FEEDBACK_POSITION = Vector3(0f, -0.28f, 0f)
private val HUD_STATUS_POSITION = Vector3(0.42f, 0.06f, 0f)

private const val RESULT_DISTANCE_METERS = 1.15f
private const val RESULT_VERTICAL_OFFSET_METERS = -0.04f
