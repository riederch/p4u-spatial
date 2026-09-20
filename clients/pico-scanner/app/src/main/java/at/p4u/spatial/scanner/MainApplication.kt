package at.p4u.spatial.scanner

import android.app.Application
import android.os.Handler
import android.os.Looper
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import com.pico.spatial.ui.design.Button
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
                val context = LocalContext.current
                val mainHandler = remember { Handler(Looper.getMainLooper()) }
                var status by remember { mutableStateOf("PICO Spatial runtime active") }
                var scannedPayload by remember { mutableStateOf<String?>(null) }
                var scanner by remember { mutableStateOf<PicoSpatialQrScanner?>(null) }

                DisposableEffect(Unit) {
                    onDispose {
                        scanner?.close()
                        scanner = null
                    }
                }

                PicoTheme(colorScheme = defaultColorScheme()) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier
                            .windowConstraints(width = 960.dp, height = 720.dp)
                            .backgroundMaterial(true)
                            .background(Color.LightGray)
                            .padding(32.dp),
                    ) {
                        Text(
                            "picoVr",
                            textAlign = TextAlign.Center,
                            fontSize = 8.em,
                        )
                        Text(
                            status,
                            textAlign = TextAlign.Center,
                            fontSize = 4.em,
                            modifier = Modifier.padding(top = 24.dp, bottom = 24.dp),
                        )
                        Button(
                            onClick = {
                                scanner?.close()
                                scannedPayload = null
                                status = "QR-Scanner startet …"

                                lateinit var nextScanner: PicoSpatialQrScanner
                                nextScanner = PicoSpatialQrScanner(
                                    context = context,
                                    onDecoded = { raw ->
                                        mainHandler.post {
                                            scannedPayload = raw
                                            status = "QR-Code erkannt"
                                            nextScanner.close()
                                            if (scanner === nextScanner) scanner = null
                                        }
                                    },
                                    onError = { message ->
                                        mainHandler.post {
                                            status = "QR-Scanner: $message"
                                            nextScanner.close()
                                            if (scanner === nextScanner) scanner = null
                                        }
                                    },
                                )
                                scanner = nextScanner
                                nextScanner.start()
                            },
                        ) {
                            Text("QR scannen")
                        }

                        scannedPayload?.let { raw ->
                            Text(
                                raw,
                                textAlign = TextAlign.Start,
                                fontSize = 3.em,
                                modifier = Modifier.padding(top = 24.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}
