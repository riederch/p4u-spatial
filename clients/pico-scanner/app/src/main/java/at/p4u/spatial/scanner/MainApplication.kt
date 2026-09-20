package at.p4u.spatial.scanner

import android.app.Application
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
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
        SystemDiagnostics.dump(this)
        launch {
            DefaultWindowContainer {
                val context = LocalContext.current
                val mainHandler = remember { Handler(Looper.getMainLooper()) }
                var status by remember { mutableStateOf("PICO Spatial runtime active") }
                var scannedPayload by remember { mutableStateOf<String?>(null) }

                DisposableEffect(context) {
                    val receiver = object : BroadcastReceiver() {
                        override fun onReceive(receiverContext: Context?, intent: Intent?) {
                            if (intent?.action != ACTION_SECUREMR_RESULT) return
                            val raw = intent.getStringExtra(EXTRA_QR_PAYLOAD) ?: return
                            scannedPayload = raw
                            status = "QR-Code erkannt"
                        }
                    }
                    context.registerReceiver(
                        receiver,
                        IntentFilter(ACTION_SECUREMR_RESULT),
                        SECUREMR_RESULT_PERMISSION,
                        mainHandler,
                        Context.RECEIVER_EXPORTED,
                    )
                    onDispose {
                        runCatching { context.unregisterReceiver(receiver) }
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
                                scannedPayload = null
                                val launchIntent =
                                    context.packageManager.getLaunchIntentForPackage(SECUREMR_HELPER_PACKAGE)
                                if (launchIntent == null) {
                                    status = "SecureMR QR-Helfer ist nicht installiert"
                                } else {
                                    status = "SecureMR QR-Scanner startet …"
                                    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                    context.startActivity(launchIntent)
                                }
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

    companion object {
        const val ACTION_SECUREMR_RESULT = "at.p4u.spatial.scanner.SECUREMR_QR_RESULT"
        const val EXTRA_QR_PAYLOAD = "payload"
        const val SECUREMR_RESULT_PERMISSION =
            "at.p4u.spatial.scanner.permission.SECUREMR_RESULT"
        const val SECUREMR_HELPER_PACKAGE = "at.p4u.spatial.securemrprobe"
    }
}
