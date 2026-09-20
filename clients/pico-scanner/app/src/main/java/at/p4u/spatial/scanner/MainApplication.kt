package at.p4u.spatial.scanner

import android.app.Application
import androidx.compose.foundation.layout.Box
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.pico.spatial.ui.foundation.dsl.DefaultWindowContainer
import com.pico.spatial.ui.foundation.dsl.launch

class MainApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        launch {
            DefaultWindowContainer {
                Box(Modifier.windowConstraints(width = 960.dp, height = 720.dp))
            }
        }
    }
}
