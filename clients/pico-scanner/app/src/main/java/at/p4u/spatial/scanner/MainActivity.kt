package at.p4u.spatial.scanner

import com.pico.spatial.ui.platform.stub.SpatialLaunchActivity

/**
 * Entry point for the PICO Spatial runtime.
 *
 * SpatialLaunchActivity owns the Android activity surface. MainApplication registers a Mixed
 * DefaultStage; persistent HUD chrome is attached to the HMD camera target inside that stage.
 */
class MainActivity : SpatialLaunchActivity()
