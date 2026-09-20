package com.bytedance.pico.secure_mr_demo.readback;

import android.app.NativeActivity;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.util.Log;

public class ReadbackActivity extends NativeActivity {
    private static final String TAG = "picoVr-SecureMR-Probe";
    private static final int REQ_CAMERA = 1001;

    static {
        System.loadLibrary("securemrprobe");
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Log.i(TAG, "Starting official OpenXR SecureMR readback compatibility probe");
        super.onCreate(savedInstanceState);
    }

    public void requestCameraFromNative() {
        if (checkSelfPermission(android.Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            Log.i(TAG, "Requesting CAMERA permission");
            requestPermissions(new String[]{android.Manifest.permission.CAMERA}, REQ_CAMERA);
        } else {
            Log.i(TAG, "CAMERA permission already granted");
            nativeSetPermission(android.Manifest.permission.CAMERA, true);
        }
    }

    @Override
    public void onRequestPermissionsResult(int rc, String[] perms, int[] grants) {
        super.onRequestPermissionsResult(rc, perms, grants);
        for (int i = 0; i < perms.length; i++) {
            if (perms[i].equals(android.Manifest.permission.CAMERA)) {
                boolean granted = grants[i] == PackageManager.PERMISSION_GRANTED;
                Log.i(TAG, "CAMERA permission result=" + granted);
                nativeSetPermission(perms[i], granted);
            }
        }
    }

    public native void nativeSetPermission(String permission, boolean granted);
}
