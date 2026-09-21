package at.p4u.picovr.qr.ui

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.core.content.ContextCompat
import at.p4u.picovr.core.feature.FeatureSnapshot
import at.p4u.picovr.qr.QrAction
import at.p4u.picovr.qr.QrFeature
import at.p4u.picovr.qr.QrReaderController
import at.p4u.picovr.qr.QrReaderState
import at.p4u.picovr.qr.QrScannerBackend
import at.p4u.picovr.ui.FeaturePresentation
import at.p4u.picovr.ui.hud.HudCommand
import at.p4u.picovr.ui.hud.HudCommandAvailability
import at.p4u.picovr.ui.hud.HudCommandRole
import at.p4u.picovr.ui.hud.HudCommandState
import at.p4u.picovr.ui.hud.HudFeedback
import at.p4u.picovr.ui.hud.HudFeedbackKind
import at.p4u.picovr.ui.hud.HudResultPanel
import at.p4u.picovr.ui.hud.LambdaHudCommand
import com.pico.spatial.ui.design.Text
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// ADR: docs/adr/app/0019-reusable-qr-reader-feature.md — QR result/action presentation belongs to the reusable QR feature surface.
// ADR: docs/adr/app/0022-modular-app-foundation-and-features.md — app composition does not render QR-specific state.
// ADR: docs/adr/app/0029-unified-xr-hud-interaction-shell.md — QR results use world-placed shared HUD result chrome while persistent controls remain head locked.
// ADR: docs/adr/app/0031-hud-controlled-ambient-feature-lifecycle.md — QR has no home/scan UI; HUD state directly controls ambient recognition.
class QrFeaturePresentation(
    context: Context,
    scannerBackend: QrScannerBackend,
    customActions: List<QrAction> = emptyList(),
) : FeaturePresentation {
    private val appContext = context.applicationContext
    private val reader =
        QrReaderController(
            context = appContext,
            scannerBackend = scannerBackend,
            customActions = customActions,
        )

    private var readerState by mutableStateOf<QrReaderState>(reader.state)

    init {
        reader.onStateChanged = { readerState = it }
    }

    override val featureId: String = QrFeature.ID

    override fun isContentVisible(snapshot: FeatureSnapshot): Boolean =
        snapshot.enabled && readerState is QrReaderState.Result

    @Composable
    override fun Runtime(
        snapshot: FeatureSnapshot,
        onFeedback: (HudFeedback) -> Unit,
    ) {
        var hasCameraPermission by remember {
            mutableStateOf(
                ContextCompat.checkSelfPermission(appContext, Manifest.permission.CAMERA) ==
                    PackageManager.PERMISSION_GRANTED,
            )
        }
        val activityContext = LocalContext.current

        LaunchedEffect(snapshot.enabled) {
            if (!snapshot.enabled) {
                reader.setEnabled(false)
                return@LaunchedEffect
            }

            hasCameraPermission =
                ContextCompat.checkSelfPermission(appContext, Manifest.permission.CAMERA) ==
                    PackageManager.PERMISSION_GRANTED

            if (!hasCameraPermission) {
                (activityContext as? Activity)?.requestPermissions(
                    arrayOf(Manifest.permission.CAMERA),
                    CAMERA_PERMISSION_REQUEST,
                )

                repeat(80) {
                    delay(250)
                    hasCameraPermission =
                        ContextCompat.checkSelfPermission(appContext, Manifest.permission.CAMERA) ==
                            PackageManager.PERMISSION_GRANTED
                    if (hasCameraPermission) {
                        reader.setEnabled(true)
                        return@LaunchedEffect
                    }
                }

                onFeedback(
                    HudFeedback(
                        kind = HudFeedbackKind.ERROR,
                        message = "Kamerazugriff wurde nicht erlaubt.",
                    ),
                )
                return@LaunchedEffect
            }

            reader.setEnabled(true)
        }

        val error = readerState as? QrReaderState.Error
        LaunchedEffect(error?.message) {
            error?.let {
                onFeedback(
                    HudFeedback(
                        kind = HudFeedbackKind.ERROR,
                        message = it.message,
                    ),
                )
            }
        }
    }

    @Composable
    override fun Content(
        snapshot: FeatureSnapshot,
        onFeedback: (HudFeedback) -> Unit,
    ) {
        val scope = rememberCoroutineScope()
        var runningActionId by remember { mutableStateOf<String?>(null) }

        val resultState = readerState as? QrReaderState.Result ?: return
        val blocked = runningActionId != null
        val commands =
            buildList<HudCommand> {
                resultState.actions.forEach { action ->
                    add(
                        QrHudCommand(
                            context = appContext,
                            result = resultState.result,
                            action = action,
                            running = runningActionId == action.id,
                            blocked = blocked && runningActionId != action.id,
                        ),
                    )
                }
                add(
                    LambdaHudCommand(
                        id = "qr.close",
                        label = "Schließen",
                        role = HudCommandRole.PASSIVE,
                        state =
                            HudCommandState(
                                availability =
                                    if (blocked) {
                                        HudCommandAvailability.DISABLED
                                    } else {
                                        HudCommandAvailability.ENABLED
                                    },
                            ),
                    ) {
                        reader.dismissResult()
                        at.p4u.picovr.ui.hud.HudCommandResult()
                    },
                )
            }

        HudResultPanel(
            title = "QR-Code erkannt",
            typeLabel = resultState.result.content.kind.name,
            commands = commands,
            onCommand = { command ->
                if (command.state.availability != HudCommandAvailability.ENABLED) {
                    return@HudResultPanel
                }

                if (command.id == "qr.close") {
                    scope.launch { command.execute() }
                    return@HudResultPanel
                }

                runningActionId = command.id
                onFeedback(
                    HudFeedback(
                        kind = HudFeedbackKind.RUNNING,
                        message = command.label,
                        persistent = true,
                    ),
                )
                scope.launch {
                    try {
                        command.execute().feedback?.let(onFeedback)
                    } catch (error: Throwable) {
                        onFeedback(
                            HudFeedback(
                                kind = HudFeedbackKind.ERROR,
                                message = error.message ?: "Aktion fehlgeschlagen.",
                            ),
                        )
                    } finally {
                        runningActionId = null
                    }
                }
            },
            modifier = Modifier.fillMaxWidth().height(520.dp),
        ) {
            Text(
                resultState.result.content.displayText,
                textAlign = TextAlign.Start,
                fontSize = 2.7.em,
            )
        }
    }

    @Composable
    override fun StatusIcon(snapshot: FeatureSnapshot) {
        Box(
            modifier = Modifier.size(40.dp).background(Color.Transparent).padding(4.dp),
        ) {
            val cell = 8.dp
            val finder = Modifier.size(cell).background(Color.Black)

            Box(modifier = finder.align(Alignment.TopStart))
            Box(modifier = finder.align(Alignment.TopEnd))
            Box(modifier = finder.align(Alignment.BottomStart))
            Box(
                modifier = Modifier.size(6.dp).background(Color.Black).align(Alignment.Center),
            )
            Box(
                modifier = Modifier.size(5.dp).background(Color.Black).align(Alignment.BottomEnd),
            )
        }
    }

    override fun close() {
        reader.close()
    }

    companion object {
        private const val CAMERA_PERMISSION_REQUEST = 1001
    }
}
