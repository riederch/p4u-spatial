package at.p4u.spatial.scanner

import com.bytedance.pico.secure_mr_demo.readback.ReadbackActivity

/**
 * PICO 4 Ultra / PICO OS 5.x entry point.
 *
 * ADR 0032 selects the native OpenXR runtime for the target headset. ReadbackActivity is the
 * repository's already validated NativeActivity/OpenXR substrate; the product keeps the public
 * launcher component name stable while the Spatial SDK bootstrap is removed.
 */
class MainActivity : ReadbackActivity()
