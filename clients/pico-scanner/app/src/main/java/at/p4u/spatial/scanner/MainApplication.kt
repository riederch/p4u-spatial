package at.p4u.spatial.scanner

import android.app.Application

// ADR 0032: PICO 4 Ultra / PICO OS 5.x boots through native OpenXR in MainActivity.
// Application initialization must stay free of PICO Spatial SDK container startup.
class MainApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        SystemDiagnostics.dump(this)
    }
}
