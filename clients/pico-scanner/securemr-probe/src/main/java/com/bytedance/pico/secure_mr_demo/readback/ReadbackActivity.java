package com.bytedance.pico.secure_mr_demo.readback;

import android.app.NativeActivity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.PlanarYUVLuminanceSource;
import com.google.zxing.common.HybridBinarizer;

import java.util.Collections;
import java.util.EnumMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public class ReadbackActivity extends NativeActivity {
    private static final String TAG = "picoVr-SecureMR-QR";
    private static final int REQ_CAMERA = 1001;
    private static final String ACTION_RESULT = "at.p4u.spatial.scanner.SECUREMR_QR_RESULT";
    private static final String RESULT_PACKAGE = "at.p4u.spatial.scanner";
    private static final String EXTRA_PAYLOAD = "payload";

    private final ExecutorService decoder = Executors.newSingleThreadExecutor();
    private final AtomicBoolean decodeInFlight = new AtomicBoolean(false);
    private final AtomicBoolean completed = new AtomicBoolean(false);

    static {
        System.loadLibrary("securemrprobe");
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Log.i(TAG, "Starting native OpenXR SecureMR QR scanner");
        Log.i(TAG, "device=" + Build.DEVICE + " model=" + Build.MODEL +
                " release=" + Build.VERSION.RELEASE + " sdk=" + Build.VERSION.SDK_INT +
                " display=" + Build.DISPLAY);
        super.onCreate(savedInstanceState);
    }

    public void requestCameraFromNative() {
        if (checkSelfPermission(android.Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{android.Manifest.permission.CAMERA}, REQ_CAMERA);
        } else {
            nativeSetPermission(android.Manifest.permission.CAMERA, true);
        }
    }

    @Override
    public void onRequestPermissionsResult(int rc, String[] perms, int[] grants) {
        super.onRequestPermissionsResult(rc, perms, grants);
        for (int i = 0; i < perms.length; i++) {
            if (perms[i].equals(android.Manifest.permission.CAMERA)) {
                nativeSetPermission(
                        perms[i],
                        grants[i] == PackageManager.PERMISSION_GRANTED
                );
            }
        }
    }

    // Called from the native SecureMR readback path. Keep the native/OpenXR thread non-blocking.
    public void onRgbFrame(byte[] rgb, int width, int height) {
        if (completed.get() || !decodeInFlight.compareAndSet(false, true)) {
            return;
        }
        decoder.execute(() -> {
            try {
                String raw = decodeQr(rgb, width, height);
                if (raw != null && completed.compareAndSet(false, true)) {
                    Log.i(TAG, "QR decoded, payloadLength=" + raw.length());
                    Intent result = new Intent(ACTION_RESULT);
                    result.setPackage(RESULT_PACKAGE);
                    result.putExtra(EXTRA_PAYLOAD, raw);
                    sendBroadcast(result);
                    runOnUiThread(this::finish);
                }
            } finally {
                decodeInFlight.set(false);
            }
        });
    }

    private String decodeQr(byte[] rgb, int width, int height) {
        int pixelCount = width * height;
        if (rgb.length < pixelCount * 3) {
            Log.w(TAG, "Short RGB frame: " + rgb.length + " bytes");
            return null;
        }

        byte[] luminance = new byte[pixelCount];
        int src = 0;
        for (int i = 0; i < pixelCount; i++) {
            int r = rgb[src] & 0xff;
            int g = rgb[src + 1] & 0xff;
            int b = rgb[src + 2] & 0xff;
            luminance[i] = (byte) ((r * 77 + g * 150 + b * 29) >> 8);
            src += 3;
        }

        PlanarYUVLuminanceSource source = new PlanarYUVLuminanceSource(
                luminance, width, height, 0, 0, width, height, false
        );
        BinaryBitmap bitmap = new BinaryBitmap(new HybridBinarizer(source));

        Map<DecodeHintType, Object> hints = new EnumMap<>(DecodeHintType.class);
        hints.put(DecodeHintType.POSSIBLE_FORMATS, Collections.singletonList(BarcodeFormat.QR_CODE));
        hints.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);

        try {
            MultiFormatReader reader = new MultiFormatReader();
            reader.setHints(hints);
            return reader.decodeWithState(bitmap).getText();
        } catch (Exception ignored) {
            return null;
        }
    }

    @Override
    protected void onDestroy() {
        completed.set(true);
        decoder.shutdownNow();
        super.onDestroy();
    }

    public native void nativeSetPermission(String permission, boolean granted);
}
