package at.p4u.spatial.scanner

import android.app.Application
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import at.p4u.picovr.core.feature.FeatureRegistry
import at.p4u.picovr.qr.QrFeature
import at.p4u.picovr.qr.ui.QrFeaturePresentation
import at.p4u.picovr.securemr.SpatialMlQrScannerBackend
import at.p4u.picovr.ui.FeaturePresentationRegistry
import at.p4u.picovr.ui.PicoFeatureShell
import com.pico.spatial.ui.foundation.dsl.DefaultStage
import com.pico.spatial.ui.foundation.dsl.launch

// ADR: docs/adr/app/0022-modular-app-foundation-and-features.md — app is the composition root; feature behavior and presentation live in feature modules.
// ADR: docs/adr/app/0029-unified-xr-hud-interaction-shell.md — the primary application container is a Mixed Stage so persistent HUD chrome can be HMD-locked instead of living in a room-fixed planar window.
class MainApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        SystemDiagnostics.dump(this)

        launch {
            DefaultStage {
                val context = LocalContext.current

                val qrFeature = remember { QrFeature(context) }
                val featureRegistry =
                    remember {
                        FeatureRegistry(
                            listOf(qrFeature),
                        )
                    }
                val presentationRegistry =
                    remember {
                        FeaturePresentationRegistry(
                            listOf(
                                QrFeaturePresentation(
                                    context = context,
                                    scannerBackend = SpatialMlQrScannerBackend(context),
                                    customActions = listOf(BridgeRegistrationQrAction()),
                                ),
                            ),
                        )
                    }

                var features by remember { mutableStateOf(featureRegistry.snapshots()) }

                DisposableEffect(featureRegistry, presentationRegistry) {
                    val featureObserver = featureRegistry.observe { features = it }
                    onDispose {
                        featureObserver.close()
                        presentationRegistry.close()
                        featureRegistry.close()
                    }
                }

                PicoFeatureShell(
                    features = features,
                    presentations = presentationRegistry,
                    onFeatureEnabledChange = featureRegistry::setEnabled,
                )
            }
        }
    }
}
