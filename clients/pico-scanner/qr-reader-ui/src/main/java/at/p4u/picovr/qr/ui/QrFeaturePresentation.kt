package at.p4u.picovr.qr.ui

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import at.p4u.picovr.core.feature.FeatureSnapshot
import at.p4u.picovr.qr.QrAction
import at.p4u.picovr.qr.QrFeature
import at.p4u.picovr.qr.QrReaderController
import at.p4u.picovr.qr.QrReaderState
import at.p4u.picovr.ui.FeaturePresentation
import at.p4u.picovr.ui.hud.HudCommand
import at.p4u.picovr.ui.hud.HudCommandAvailability
import at.p4u.picovr.ui.hud.HudCommandRole
import at.p4u.picovr.ui.hud.HudCommandState
import at.p4u.picovr.ui.hud.HudFeedback
import at.p4u.picovr.ui.hud.HudFeedbackKind
import at.p4u.picovr.ui.hud.HudResultPanel
import at.p4u.picovr.ui.hud.LambdaHudCommand
import com.pico.spatial.ui.design.Button
import com.pico.spatial.ui.design.Text
import kotlinx.coroutines.launch

// ADR: docs/adr/app/0019-reusable-qr-reader-feature.md — QR result/action presentation belongs to the reusable QR feature surface.
// ADR: docs/adr/app/0022-modular-app-foundation-and-features.md — app composition does not render QR-specific state.
// ADR: docs/adr/app/0029-unified-xr-hud-interaction-shell.md — QR results use the shared HUD result panel, commands and feedback language.
class QrFeaturePresentation(
    context: Context,
    customActions: List<QrAction> = emptyList(),
) : FeaturePresentation {
    private val appContext = context.applicationContext
    private val reader = QrReaderController(
        appContext,
        customActions = customActions,
    )

    override val featureId: String = QrFeature.ID
    override val isHomeSurface: Boolean = true

    @Composable
    override fun Content(
        snapshot: FeatureSnapshot,
        onFeedback: (HudFeedback) -> Unit,
    ) {
        val scope = rememberCoroutineScope()
        var readerState by remember { mutableStateOf<QrReaderState>(reader.state) }
        var runningActionId by remember { mutableStateOf<String?>(null) }

        DisposableEffect(reader) {
            reader.onStateChanged = { readerState = it }
            onDispose { reader.onStateChanged = null }
        }

        if (!snapshot.enabled) {
            Text(
                "QR-Code-Erkennung ist ausgeschaltet.",
                textAlign = TextAlign.Center,
                fontSize = 3.em,
                modifier = Modifier.padding(top = 24.dp),
            )
            return
        }

        when (val state = readerState) {
            QrReaderState.Idle -> {
                Text(
                    "Allgemeiner QR-Reader",
                    textAlign = TextAlign.Center,
                    fontSize = 4.em,
                    modifier = Modifier.padding(top = 24.dp, bottom = 24.dp),
                )
                Button(onClick = reader::scan) {
                    Text("QR scannen")
                }
            }

            QrReaderState.Scanning -> {
                Text(
                    "QR-Code wird erkannt …",
                    textAlign = TextAlign.Center,
                    fontSize = 4.em,
                    modifier = Modifier.padding(top = 24.dp),
                )
            }

            is QrReaderState.Error -> {
                Text(
                    state.message,
                    textAlign = TextAlign.Center,
                    fontSize = 3.em,
                    modifier = Modifier.padding(top = 24.dp, bottom = 24.dp),
                )
                Button(onClick = reader::scan) {
                    Text("Erneut scannen")
                }
            }

            is QrReaderState.Result -> {
                val blocked = runningActionId != null
                val commands = buildList<HudCommand> {
                    state.actions.forEach { action ->
                        add(
                            QrHudCommand(
                                context = appContext,
                                result = state.result,
                                action = action,
                                running = runningActionId == action.id,
                                blocked = blocked && runningActionId != action.id,
                            ),
                        )
                    }
                    add(
                        LambdaHudCommand(
                            id = "qr.scan-again",
                            label = "Neu scannen",
                            role = HudCommandRole.SECONDARY,
                            state = HudCommandState(
                                availability = if (blocked) {
                                    HudCommandAvailability.DISABLED
                                } else {
                                    HudCommandAvailability.ENABLED
                                },
                            ),
                        ) {
                            reader.scan()
                            at.p4u.picovr.ui.hud.HudCommandResult()
                        },
                    )
                    add(
                        LambdaHudCommand(
                            id = "qr.close",
                            label = "Schließen",
                            role = HudCommandRole.PASSIVE,
                            state = HudCommandState(
                                availability = if (blocked) {
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
                    typeLabel = state.result.content.kind.name,
                    commands = commands,
                    onCommand = { command ->
                        if (command.state.availability != HudCommandAvailability.ENABLED) {
                            return@HudResultPanel
                        }

                        if (command.id == "qr.scan-again" || command.id == "qr.close") {
                            scope.launch {
                                command.execute()
                            }
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
                                val result = command.execute()
                                result.feedback?.let(onFeedback)
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
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(520.dp),
                ) {
                    Text(
                        state.result.content.displayText,
                        textAlign = TextAlign.Start,
                        fontSize = 2.7.em,
                    )
                }
            }
        }
    }

    @Composable
    override fun StatusIcon(snapshot: FeatureSnapshot) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .background(Color.Transparent)
                .padding(4.dp),
        ) {
            val cell = 8.dp
            val finder = Modifier
                .size(cell)
                .background(Color.Black)

            Box(modifier = finder.align(Alignment.TopStart))
            Box(modifier = finder.align(Alignment.TopEnd))
            Box(modifier = finder.align(Alignment.BottomStart))
            Box(
                modifier = Modifier
                    .size(6.dp)
                    .background(Color.Black)
                    .align(Alignment.Center),
            )
            Box(
                modifier = Modifier
                    .size(5.dp)
                    .background(Color.Black)
                    .align(Alignment.BottomEnd),
            )
        }
    }

    override fun close() {
        reader.close()
    }
}
