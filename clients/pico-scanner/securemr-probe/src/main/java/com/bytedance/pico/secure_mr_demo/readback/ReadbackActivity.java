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
import java.util.concurrent.atomic.AtomicInteger;

// ADR: docs/adr/app/0020-securemr-qr-scanner-backend.md — PICO SecureMR/OpenXR remains a vendor backend behind the generic QR feature.
public class ReadbackActivity extends NativeActivity {
    private static final String TAG = "p4u-SecureMR-QR";
    private static final int REQ_CAMERA = 1001;

    public static final String EXTRA_RESULT_ACTION = "at.p4u.picovr.qr.extra.RESULT_ACTION";
    public static final String EXTRA_RESULT_PACKAGE = "at.p4u.picovr.qr.extra.RESULT_PACKAGE";
    public static final String EXTRA_PAYLOAD = "payload";
    public static final String EXTRA_STATUS = "status";
    public static final String EXTRA_MESSAGE = "message";

    public static final String STATUS_DECODED = "decoded";
    public static final String STATUS_CANCELLED = "cancelled";
    public static final String STATUS_ERROR = "error";

    private static final String LEGACY_ACTION_RESULT =
            "at.p4u.spatial.scanner.SECUREMR_QR_RESULT";

    private final ExecutorService decoder = Executors.newSingleThreadExecutor();
    private final AtomicBoolean decodeInFlight = new AtomicBoolean(false);
    private final AtomicBoolean completed = new AtomicBoolean(false);
    private final AtomicBoolean recognitionEnabled = new AtomicBoolean(true);
    private final AtomicInteger frameCount = new AtomicInteger(0);

    private static final String PREFS_NAME = "p4u-qr-reader";
    private static final String PREF_RECOGNITION_ENABLED = "qr-recognition-enabled";

    private String resultAction;
    private String resultPackage;

    static {
        System.loadLibrary("securemrprobe");
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Intent launchIntent = getIntent();
        resultAction = launchIntent.getStringExtra(EXTRA_RESULT_ACTION);
        if (resultAction == null || resultAction.isBlank()) {
            resultAction = LEGACY_ACTION_RESULT;
        }
        resultPackage = launchIntent.getStringExtra(EXTRA_RESULT_PACKAGE);
        if (resultPackage == null || resultPackage.isBlank()) {
            resultPackage = getPackageName();
        }

        boolean savedRecognitionEnabled = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .getBoolean(PREF_RECOGNITION_ENABLED, true);
        recognitionEnabled.set(savedRecognitionEnabled);
        nativeSetQrRecognitionEnabled(savedRecognitionEnabled);

        Log.i(TAG, "Starting native OpenXR SecureMR QR scanner");
        Log.i(TAG, "device=" + Build.DEVICE + " model=" + Build.MODEL +
                " release=" + Build.VERSION.RELEASE + " sdk=" + Build.VERSION.SDK_INT +
                " display=" + Build.DISPLAY);
        super.onCreate(savedInstanceState);
    }

    public void requestCameraFromNative() {
        boolean granted =
                checkSelfPermission(android.Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
        Log.i(TAG, "Camera permission before request: " + granted);
        if (!granted) {
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
                boolean granted = grants[i] == PackageManager.PERMISSION_GRANTED;
                Log.i(TAG, "Camera permission result: " + granted);
                nativeSetPermission(perms[i], granted);
                if (!granted && complete(
                        STATUS_ERROR,
                        null,
                        "Camera permission was denied."
                )) {
                    runOnUiThread(this::finish);
                }
            }
        }
    }

    // Called from the native SecureMR readback path. Keep the native/OpenXR thread non-blocking.
    public void onRgbFrame(byte[] rgb, int width, int height) {
        int currentFrame = frameCount.incrementAndGet();
        if (currentFrame == 1 || currentFrame % 30 == 0) {
            Log.i(TAG, "RGB frame #" + currentFrame + " " + width + "x" + height +
                    " bytes=" + rgb.length);
        }
        if (!recognitionEnabled.get() || completed.get() ||
                !decodeInFlight.compareAndSet(false, true)) {
            return;
        }
        decoder.execute(() -> {
            try {
                String raw = decodeQr(rgb, width, height);
                if (raw != null && recognitionEnabled.get() &&
                        complete(STATUS_DECODED, raw, null)) {
                    // First valid decode wins. This deliberately keeps moving/mobile QR codes responsive.
                    Log.i(TAG, "QR decoded, payloadLength=" + raw.length());
                    runOnUiThread(this::finish);
                }
            } finally {
                decodeInFlight.set(false);
            }
        });
    }

    private boolean complete(String status, String payload, String message) {
        if (!completed.compareAndSet(false, true)) {
            return false;
        }
        Intent result = new Intent(resultAction);
        result.setPackage(resultPackage);
        result.putExtra(EXTRA_STATUS, status);
        if (payload != null) {
            result.putExtra(EXTRA_PAYLOAD, payload);
        }
        if (message != null) {
            result.putExtra(EXTRA_MESSAGE, message);
        }
        sendBroadcast(result);
        return true;
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
        hints.put(DecodeHintType.ALSO_INVERTED, Boolean.TRUE);

        try {
            MultiFormatReader reader = new MultiFormatReader();
            reader.setHints(hints);
            return reader.decodeWithState(bitmap).getText();
        } catch (Exception ignored) {
            return null;
        }
    }

    public void onQrRecognitionChanged(boolean enabled) {
        recognitionEnabled.set(enabled);
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .edit()
                .putBoolean(PREF_RECOGNITION_ENABLED, enabled)
                .apply();
        Log.i(TAG, "QR recognition " + (enabled ? "enabled" : "disabled"));
    }

    @Override
    protected void onDestroy() {
        complete(STATUS_CANCELLED, null, null);
        decoder.shutdownNow();
        super.onDestroy();
    }

    public native void nativeSetPermission(String permission, boolean granted);
    public native void nativeSetQrRecognitionEnabled(boolean enabled);
}
