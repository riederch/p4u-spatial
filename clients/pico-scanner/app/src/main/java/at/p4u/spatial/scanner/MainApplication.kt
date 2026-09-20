package at.p4u.spatial.scanner

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import com.pico.spatial.ui.design.PicoTheme
import com.pico.spatial.ui.design.Text
import com.pico.spatial.ui.design.defaultColorScheme
import com.pico.spatial.ui.foundation.dsl.DefaultWindowContainer
import com.pico.spatial.ui.foundation.dsl.launch
import com.pico.spatial.ui.foundation.material.backgroundMaterial

class MainApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        launch {
            DefaultWindowContainer {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier
                        .windowConstraints(width = 960.dp, height = 720.dp)
                        .backgroundMaterial(true)
                        .background(Color.LightGray)
                        .padding(32.dp),
                ) {
                    PicoTheme(colorScheme = defaultColorScheme()) {
                        Text(
                            "picoVr",
                            textAlign = TextAlign.Center,
                            fontSize = 8.em,
                        )
                        Text(
                            "PICO Spatial runtime active",
                            textAlign = TextAlign.Center,
                            fontSize = 4.em,
                            modifier = Modifier.padding(top = 24.dp),
                        )
                    }
                }
            }
        }
    }
}
