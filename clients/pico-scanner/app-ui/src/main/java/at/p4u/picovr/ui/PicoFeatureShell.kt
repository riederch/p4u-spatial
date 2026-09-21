package at.p4u.picovr.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import at.p4u.picovr.core.feature.FeatureSnapshot
import com.pico.spatial.ui.design.Button
import com.pico.spatial.ui.design.PicoTheme
import com.pico.spatial.ui.design.Text
import com.pico.spatial.ui.design.defaultColorScheme
import com.pico.spatial.ui.foundation.geometry.NormalizedPoint3D
import com.pico.spatial.ui.foundation.material.backgroundMaterial
import com.pico.spatial.ui.foundation.window.Augment
import com.pico.spatial.ui.foundation.window.AugmentContentAlignment
import com.pico.spatial.ui.platform.ViewPoint

// ADR: docs/adr/app/0022-modular-app-foundation-and-features.md — shell renders generic feature presentations without importing feature-specific types.
// ADR: docs/adr/app/0021-xr-control-and-status-hud.md — menu and status projection derive from authoritative feature snapshots.
@Composable
fun PicoFeatureShell(
    features: List<FeatureSnapshot>,
    presentations: FeaturePresentationRegistry,
    onFeatureEnabledChange: (featureId: String, enabled: Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    PicoTheme(colorScheme = defaultColorScheme()) {
        Box(
            modifier = modifier
                .backgroundMaterial(true)
                .background(Color.LightGray)
                .padding(32.dp),
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(start = 120.dp, end = 72.dp),
            ) {
                Text("picoVr", textAlign = TextAlign.Center, fontSize = 8.em)
                presentations.home()?.Content()
            }

        }

        Augment(
            anchor = NormalizedPoint3D(0.08f, 0.96f, 0f),
            alignment = AugmentContentAlignment.BottomCenter,
            followViewpoints = ViewPoint.All,
            enableMaterialBackground = false,
            focusable = true,
        ) {
            FeatureMenu(
                features = features,
                onFeatureEnabledChange = onFeatureEnabledChange,
            )
        }

        Augment(
            anchor = NormalizedPoint3D(0.94f, 0.78f, 0f),
            alignment = AugmentContentAlignment.BottomCenter,
            followViewpoints = ViewPoint.All,
            enableMaterialBackground = false,
            focusable = false,
        ) {
            ActiveFunctionStatusBar(
                features = features,
                presentations = presentations,
            )
        }
    }
}

private data class MenuNode(
    val name: String,
    val children: Map<String, MenuNode>,
    val features: List<FeatureSnapshot>,
)

private fun menuTree(features: List<FeatureSnapshot>): MenuNode {
    class MutableNode(val name: String) {
        val children = linkedMapOf<String, MutableNode>()
        val features = mutableListOf<FeatureSnapshot>()
    }

    val root = MutableNode("")
    features.forEach { feature ->
        var node = root
        feature.menuPath.forEach { segment ->
            node = node.children.getOrPut(segment) { MutableNode(segment) }
        }
        node.features += feature
    }

    fun freeze(node: MutableNode): MenuNode =
        MenuNode(
            name = node.name,
            children = node.children.mapValues { freeze(it.value) },
            features = node.features.toList(),
        )

    return freeze(root)
}

private fun MenuNode.resolve(path: List<String>): MenuNode? {
    var node = this
    path.forEach { segment ->
        node = node.children[segment] ?: return null
    }
    return node
}

@Composable
private fun FeatureMenu(
    features: List<FeatureSnapshot>,
    onFeatureEnabledChange: (featureId: String, enabled: Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    var open by remember { mutableStateOf(false) }
    var path by remember { mutableStateOf(emptyList<String>()) }
    val tree = remember(features) { menuTree(features) }
    val node = tree.resolve(path) ?: tree

    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.Start,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (open) {
            Column(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier
                    .background(Color.White.copy(alpha = 0.90f))
                    .border(2.dp, Color.Black)
                    .padding(12.dp),
            ) {
                if (path.isNotEmpty()) {
                    Text(
                        path.joinToString(" / "),
                        fontSize = 2.em,
                    )
                    Button(
                        onClick = { path = path.dropLast(1) },
                    ) {
                        Text("Zurück")
                    }
                }

                node.children.values.forEach { child ->
                    Button(
                        onClick = { path = path + child.name },
                    ) {
                        Text(child.name)
                    }
                }

                node.features.forEach { feature ->
                    if (feature.toggleable) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(feature.title, fontSize = 2.em)
                            Button(
                                onClick = {
                                    onFeatureEnabledChange(feature.id, !feature.enabled)
                                },
                            ) {
                                Text(if (feature.enabled) "Ein" else "Aus")
                            }
                        }
                    } else {
                        Text(feature.title, fontSize = 2.em)
                    }
                }

                if (node.children.isEmpty() && node.features.isEmpty()) {
                    Text("Keine Einträge", fontSize = 2.em)
                }
            }
        }

        Button(
            onClick = {
                open = !open
                if (!open) path = emptyList()
            },
        ) {
            Text(if (open) "Menü schließen" else "Menü")
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
