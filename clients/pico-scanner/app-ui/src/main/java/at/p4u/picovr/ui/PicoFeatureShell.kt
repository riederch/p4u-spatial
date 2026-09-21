package at.p4u.picovr.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import at.p4u.picovr.core.feature.FeatureSnapshot
import com.pico.spatial.ui.design.PicoTheme
import com.pico.spatial.ui.design.Text
import com.pico.spatial.ui.design.defaultColorScheme
import com.pico.spatial.ui.foundation.material.backgroundMaterial

// ADR: docs/adr/app/0022-modular-app-foundation-and-features.md — shell renders generic feature presentations without importing feature-specific types.
// ADR: docs/adr/app/0021-xr-control-and-status-hud.md — status projection derives from authoritative feature snapshots.
@Composable
fun PicoFeatureShell(
    features: List<FeatureSnapshot>,
    presentations: FeaturePresentationRegistry,
) {
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
                presentations.home()?.Content()
            }

            ActiveFunctionStatusBar(
                features = features,
                presentations = presentations,
                modifier = Modifier.align(Alignment.CenterEnd),
            )
        }
    }
}

@Composable
private fun ActiveFunctionStatusBar(
    features: List<FeatureSnapshot>,
    presentations: FeaturePresentationRegistry,
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
                val presentation = presentations.presentation(feature.id)
                if (presentation != null) {
                    presentation.StatusIcon(feature)
                } else {
                    GenericStatusIcon(feature)
                }
            }
    }
}

@Composable
private fun GenericStatusIcon(
    feature: FeatureSnapshot,
) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .size(44.dp)
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
