package at.p4u.spatial.scanner

import android.app.Application
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.pico.spatial.ui.foundation.dsl.DefaultWindowContainer
import com.pico.spatial.ui.foundation.dsl.launch
import com.pico.spatial.ui.foundation.windowConstraints

class MainApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        launch {
            DefaultWindowContainer {
                PicoVrSpatialHome()
            }
        }
    }
}

@Composable
private fun PicoVrSpatialHome() {
    Column(
        Modifier
            .windowConstraints(width = 960.dp, height = 720.dp)
            .fillMaxSize()
            .padding(24.dp)
    ) {
        Text("picoVr")
        Text("PICO Spatial runtime active")
        Text("QR/Bridge controls are temporarily disabled while SpatialML runtime integration is validated.")
        Button(onClick = {}) {
            Text("Spatial UI ready")
        }
    }
}
