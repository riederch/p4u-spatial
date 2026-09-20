package at.p4u.spatial.scanner

import com.pico.spatial.ui.platform.stub.SpatialLaunchActivity

/**
 * Entry point for the PICO Spatial runtime.
 *
 * SpatialLaunchActivity owns the Android activity surface. Application UI is registered through
 * MainApplication's DefaultWindowContainer, matching PICO's official SpatialML sample.
 */
class MainActivity : SpatialLaunchActivity()
