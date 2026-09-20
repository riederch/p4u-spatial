# picoVr SecureMR compatibility probe

This module is a hardware probe for PICO 4 Ultra on PICO OS 5.x.

It uses the official `Pico-Developer/SecureMR-Samples` native OpenXR readback implementation,
pinned to commit `02f7172b2cbddf0c31a9bda2b23df0f06b7b5a0b`. It intentionally does not use
SpatialML 6.x or `SSMRConnection`.

## Build

```bash
./gradlew :securemr-probe:assembleDebug
```

## Install

```bash
adb install -r securemr-probe/build/outputs/apk/debug/securemr-probe-debug.apk
```

## Run and capture only the relevant log

```bash
adb logcat -c
adb shell am force-stop at.p4u.spatial.securemrprobe
adb shell monkey -p at.p4u.spatial.securemrprobe -c android.intent.category.LAUNCHER 1
adb logcat -v time picoVr-SecureMR-Probe:I testbench:V OpenXR:* PxrPlugin:* AndroidRuntime:E '*:S'
```

Grant CAMERA permission when prompted.

A compatible runtime should enumerate the PICO SecureMR/readback OpenXR extensions, create the
SecureMR framework and pipeline, and eventually log a readback output path. The official sample
writes `output.png` into the app-specific external files directory after a successful CPU readback.


## QR bridge mode

The helper now forwards CPU RGB readback frames to ZXing. After a QR code is decoded it sends
`at.p4u.spatial.scanner.SECUREMR_QR_RESULT` to the scanner app and exits. The broadcast is
protected by a signature-level permission, so the scanner and helper must be signed by the same
certificate.

For a local hardware test install both debug APKs from the same build:

```bash
./gradlew :app:installDebug :securemr-probe:installDebug
```

Then launch the normal `P4U Spatial Scanner` and press **QR scannen**.
