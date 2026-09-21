package at.p4u.spatial.scanner

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.DisposableEffect
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
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import at.p4u.picovr.core.feature.FeatureRegistry
import at.p4u.picovr.core.feature.FeatureSnapshot
import at.p4u.picovr.qr.QrAction
import at.p4u.picovr.qr.QrActionResult
import at.p4u.picovr.qr.QrFeature
import at.p4u.picovr.qr.QrReaderController
import at.p4u.picovr.qr.QrReaderState
import at.p4u.picovr.qr.QrResult
import com.pico.spatial.ui.design.Button
import com.pico.spatial.ui.design.PicoTheme
import com.pico.spatial.ui.design.Text
import com.pico.spatial.ui.design.defaultColorScheme
import com.pico.spatial.ui.foundation.dsl.DefaultWindowContainer
import com.pico.spatial.ui.foundation.dsl.launch
import com.pico.spatial.ui.foundation.material.backgroundMaterial
import kotlinx.coroutines.launch as launchCoroutine

// ADR: docs/adr/app/0022-modular-app-foundation-and-features.md — app is the composition root; feature behavior lives in feature modules.
class MainApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        SystemDiagnostics.dump(this)
        launch {
            DefaultWindowContainer {
                val context = LocalContext.current
                val scope = rememberCoroutineScope()

                val qrFeature = remember { QrFeature(context) }
                val featureRegistry = remember {
                    FeatureRegistry(
                        listOf(qrFeature),
                    )
                }
                val reader = remember {
                    QrReaderController(
                        context,
                        customActions = listOf(BridgeRegistrationQrAction()),
                    )
                }

                var features by remember { mutableStateOf(featureRegistry.snapshots()) }
                var readerState by remember { mutableStateOf<QrReaderState>(reader.state) }
                var actionMessage by remember { mutableStateOf<String?>(null) }
                var runningActionId by remember { mutableStateOf<String?>(null) }

                DisposableEffect(reader, featureRegistry) {
                    reader.onStateChanged = { readerState = it }
                    val featureObserver = featureRegistry.observe { features = it }
                    onDispose {
                        featureObserver.close()
                        featureRegistry.close()
                        reader.close()
                    }
                }

                PicoTheme(colorScheme = defaultColorScheme()) {
                    Box(
                        modifier = Modifier
                            .windowConstraints(width = 960.dp, height = 720.dp)
                            .backgroundMaterial(true)
                            .background(Color.LightGray)
                            .padding(32.dp),
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(end = 72.dp),
                        ) {
                            Text("picoVr", textAlign = TextAlign.Center, fontSize = 8.em)

                            when (val state = readerState) {
                                QrReaderState.Idle -> {
                                    Text(
                                        "Allgemeiner QR-Reader",
                                        textAlign = TextAlign.Center,
                                        fontSize = 4.em,
                                        modifier = Modifier.padding(top = 24.dp, bottom = 24.dp),
                                    )
                                    Button(
                                        onClick = {
                                            actionMessage = null
                                            reader.scan()
                                        },
                                    ) {
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
                                    Button(onClick = reader::scan) { Text("Erneut scannen") }
                                }

                                is QrReaderState.Result -> {
                                    QrResultView(
                                        result = state.result,
                                        actions = state.actions,
                                        actionMessage = actionMessage,
                                        runningActionId = runningActionId,
                                        onAction = { action ->
                                            if (runningActionId != null) return@QrResultView
                                            runningActionId = action.id
                                            actionMessage = if (action.id == "bridge.register") {
                                                "Bridge wird registriert …"
                                            } else {
                                                null
                                            }
                                            scope.launchCoroutine {
                                                actionMessage = when (
                                                    val outcome = action.execute(context, state.result)
                                                ) {
                                                    is QrActionResult.Success ->
                                                        outcome.message ?: "Aktion ausgeführt."
                                                    is QrActionResult.Failure -> outcome.message
                                                }
                                                runningActionId = null
                                            }
                                        },
                                        onScanAgain = {
                                            actionMessage = null
                                            reader.scan()
                                        },
                                    )
                                }
                            }
                        }

                        ActiveFunctionStatusBar(
                            features = features,
                            modifier = Modifier.align(Alignment.CenterEnd),
                        )
                    }
                }
            }
        }
    }
}

@androidx.compose.runtime.Composable
private fun QrResultView(
    result: QrResult,
    actions: List<QrAction>,
    actionMessage: String?,
    runningActionId: String?,
    onAction: (QrAction) -> Unit,
    onScanAgain: () -> Unit,
) {
    val scroll = rememberScrollState()

    LaunchedEffect(result.raw) {
        scroll.scrollTo(0)
    }

    Text(
        "QR-Code erkannt",
        textAlign = TextAlign.Center,
        fontSize = 4.em,
        modifier = Modifier.padding(top = 20.dp, bottom = 12.dp),
    )

    Text(
        result.content.kind.name,
        textAlign = TextAlign.Center,
        fontSize = 2.5.em,
        modifier = Modifier.padding(bottom = 8.dp),
    )

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .height(360.dp)
            .background(Color.White.copy(alpha = 0.72f))
            .padding(20.dp)
            .verticalScroll(scroll),
    ) {
        Text(
            result.content.displayText,
            textAlign = TextAlign.Start,
            fontSize = 2.7.em,
        )
    }

    actionMessage?.let {
        Text(
            it,
            textAlign = TextAlign.Center,
            fontSize = 2.5.em,
            modifier = Modifier.padding(top = 12.dp),
        )
    }

    Row(
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 16.dp),
    ) {
        actions.forEach { action ->
            Button(
                onClick = {
                    if (runningActionId == null) onAction(action)
                },
            ) {
                Text(if (runningActionId == action.id) "Bitte warten …" else action.title)
            }
        }
        Button(onClick = onScanAgain) {
            Text("Neu scannen")
        }
    }
}

// ADR: docs/adr/app/0021-xr-control-and-status-hud.md — active-function UI is derived from the generic feature registry, not feature-specific shadow state.
@androidx.compose.runtime.Composable
private fun ActiveFunctionStatusBar(
    features: List<FeatureSnapshot>,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        features
            .filter { it.enabled && it.statusIconKey != null }
            .forEach { feature ->
                FeatureStatusIcon(feature)
            }
    }
}

@androidx.compose.runtime.Composable
private fun FeatureStatusIcon(
    feature: FeatureSnapshot,
) {
    when (feature.statusIconKey) {
        QrFeature.STATUS_ICON_KEY -> QrFunctionStatusIcon()
        else -> GenericFunctionStatusIcon(feature)
    }
}

@androidx.compose.runtime.Composable
private fun GenericFunctionStatusIcon(
    feature: FeatureSnapshot,
    size: Dp = 44.dp,
) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .size(size)
            .background(Color.White.copy(alpha = 0.82f))
            .border(2.dp, Color.Black)
            .padding(4.dp),
    ) {
        Text(
            feature.title.take(2).uppercase(),
            textAlign = TextAlign.Center,
            fontSize = 2.em,
        )
    }
}

@androidx.compose.runtime.Composable
private fun QrFunctionStatusIcon(
    size: Dp = 44.dp,
) {
    Box(
        modifier = Modifier
            .size(size)
            .background(Color.White.copy(alpha = 0.82f))
            .border(2.dp, Color.Black)
            .padding(6.dp),
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
