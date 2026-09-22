// Copyright (2025) Bytedance Ltd. and/or its affiliates
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// This file is derived from the official PICO SecureMR readback sample.
// The readback sink is adapted to deliver RGB frames to the Java QR decoder.
//
// The official readback_file.cpp is also the single translation unit that
// provides stb_image/stb_image_write implementations. Because this adapted
// file replaces it, keep those implementation defines here so the GPU helper
// objects linked by the official sample still resolve stbi_* symbols.

#define STB_IMAGE_IMPLEMENTATION
#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "readback_file.h"
#include <algorithm>
#include <android/log.h>
#include <array>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <string>

#ifdef __cplusplus
extern "C" {
#endif

JNIEXPORT void JNICALL
Java_com_bytedance_pico_secure_1mr_1demo_readback_ReadbackActivity_nativeSetPermission(
    JNIEnv* env,
    jclass,
    jstring permission,
    jboolean granted) {
  const char* permUtf = env->GetStringUTFChars(permission, nullptr);
  std::string perm(permUtf);
  env->ReleaseStringUTFChars(permission, permUtf);

  std::lock_guard<std::mutex> lock(g_permMutex);
  if (perm == "android.permission.CAMERA") {
    gPermissionCamera = granted == JNI_TRUE;
  }
}

#ifdef __cplusplus
}
#endif

// ADR: docs/adr/app/0020-securemr-qr-scanner-backend.md — native camera access/readback stays isolated in the PICO backend.
namespace SecureMR {

#ifdef XR_READBACK_USE_CPU
bool ReadbackCheck::isCpuBuffer = true;
#else
bool ReadbackCheck::isCpuBuffer = false;
#endif

struct android_app* ReadbackCheck::gapp = nullptr;
static std::atomic<bool> gQrRecognitionEnabled{true};

extern "C" JNIEXPORT void JNICALL
Java_com_bytedance_pico_secure_1mr_1demo_readback_ReadbackActivity_nativeSetQrRecognitionEnabled(
    JNIEnv*,
    jclass,
    jboolean enabled) {
  gQrRecognitionEnabled.store(enabled == JNI_TRUE);
}


class QrReadbackCheck final : public ReadbackCheck {
 public:
  QrReadbackCheck(const XrInstance& instance, const XrSession& session)
      : ReadbackCheck(instance, session) {}

  // The pinned PICO sample names this generic quad hook "ScanOverlay". For p4u it is
  // exclusively the persistent ADR-0029 HUD surface; no scanner frame is rendered.
  [[nodiscard]] bool WantsScanOverlay() const override { return true; }

  [[nodiscard]] bool WantsControllerVisualization() const override { return false; }

  void UpdateControllerPose(
      const XrPosef* leftPose,
      const XrPosef* rightPose,
      const XrView* views,
      uint32_t viewCount) override {
    const XrPosef* poses[2] = {leftPose, rightPose};
    for (int side = 0; side < 2; ++side) {
      pointerPoseValid_[side] = poses[side] != nullptr;
      if (poses[side] != nullptr) {
        pointerPoses_[side] = *poses[side];
      }
    }

    if (views != nullptr && viewCount > 0) {
      headPose_ = views[0].pose;
      if (viewCount > 1) {
        headPose_.position.x = (views[0].pose.position.x + views[1].pose.position.x) * 0.5f;
        headPose_.position.y = (views[0].pose.position.y + views[1].pose.position.y) * 0.5f;
        headPose_.position.z = (views[0].pose.position.z + views[1].pose.position.z) * 0.5f;
      }
      headPoseValid_ = true;
    }

    UpdateHudHover();
  }

  void UpdateHeadPose(const XrPosef& pose) override {
    // Keep a valid fallback for frames where view data is temporarily unavailable.
    if (!headPoseValid_) {
      headPose_ = pose;
      headPoseValid_ = true;
    }
  }

  void HandleButtonPress(int side = -1) override {
    if (side < 0 || side >= 2) return;
    if (!launcherHit_[side]) return;

    hudOpen_ = !hudOpen_;
    pointerPulseFrames_[side] = 9;
    hudDirty_ = true;
    LOGI("HUD launcher activate side=%d open=%s", side, hudOpen_ ? "yes" : "no");
  }

  bool UpdateOverlayRgba(
      int width,
      int height,
      std::vector<uint8_t>& outRgba) override {
    if (!hudDirty_ && outRgba.size() == static_cast<size_t>(width) * height * 4) {
      return false;
    }

    outRgba.assign(static_cast<size_t>(width) * height * 4, 0);

    const PixelRect launcher = LauncherRect(width, height);
    if (hudOpen_) {
      const PixelRect panel{
          static_cast<int>(width * 0.08f),
          static_cast<int>(height * 0.20f),
          static_cast<int>(width * 0.70f),
          static_cast<int>(height * 0.66f),
      };
      FillRect(outRgba, width, height, panel, 18, 20, 24, 220);
      StrokeRect(outRgba, width, height, panel, 3, 220, 224, 232, 170);

      // Temporary shell geometry only. Semantic rows arrive from app-core in the next step.
      const int rowLeft = panel.left + static_cast<int>(width * 0.035f);
      const int rowRight = panel.right - static_cast<int>(width * 0.035f);
      const int firstRow = panel.top + static_cast<int>(height * 0.13f);
      const int rowGap = static_cast<int>(height * 0.11f);
      for (int row = 0; row < 3; ++row) {
        const int y = firstRow + row * rowGap;
        FillRect(
            outRgba,
            width,
            height,
            PixelRect{rowLeft, y, rowRight, y + static_cast<int>(height * 0.055f)},
            44,
            48,
            56,
            215);
      }
    }

    const bool hovered = launcherHovered_;
    FillRect(
        outRgba,
        width,
        height,
        launcher,
        hovered ? 232 : 220,
        hovered ? 236 : 224,
        hovered ? 244 : 232,
        hovered ? 245 : 220);
    StrokeRect(outRgba, width, height, launcher, 3, 24, 28, 34, 210);

    if (hudOpen_) {
      DrawCloseGlyph(outRgba, width, height, launcher);
    } else {
      DrawMenuGlyph(outRgba, width, height, launcher);
    }

    bool keepAnimating = false;
    for (int side = 0; side < 2; ++side) {
      if (!pointerUvValid_[side]) continue;

      const int x = static_cast<int>(pointerU_[side] * static_cast<float>(width));
      const int y = static_cast<int>(pointerV_[side] * static_cast<float>(height));
      const bool hover = launcherHit_[side];
      const bool pressed = pointerPulseFrames_[side] > 0;

      const int outerRadius = pressed ? 18 : (hover ? 15 : 12);
      const int innerRadius = pressed ? 6 : (hover ? 5 : 4);
      const uint8_t ringAlpha = pressed ? 245 : (hover ? 220 : 155);
      const uint8_t dotAlpha = pressed ? 255 : (hover ? 235 : 185);

      DrawCircleRing(
          outRgba,
          width,
          height,
          x,
          y,
          outerRadius,
          2,
          236,
          241,
          248,
          ringAlpha);
      DrawFilledCircle(
          outRgba,
          width,
          height,
          x,
          y,
          innerRadius,
          236,
          241,
          248,
          dotAlpha);

      if (pointerPulseFrames_[side] > 0) {
        --pointerPulseFrames_[side];
        keepAnimating = pointerPulseFrames_[side] > 0 || keepAnimating;
      }
    }

    hudDirty_ = keepAnimating;
    return true;
  }

 private:
  struct PixelRect {
    int left;
    int top;
    int right;
    int bottom;
  };

  struct Vec3 {
    float x;
    float y;
    float z;
  };

  static constexpr float kHudDistanceMeters = 0.50f;
  static constexpr float kHudWidthMeters = 0.30f;
  static constexpr float kHudHeightMeters = 0.30f;
  static constexpr float kPointerRedrawThreshold = 0.003f;

  static Vec3 Rotate(const XrQuaternionf& q, const Vec3& v) {
    const Vec3 u{q.x, q.y, q.z};
    const float s = q.w;
    const float dotUv = u.x * v.x + u.y * v.y + u.z * v.z;
    const float dotUu = u.x * u.x + u.y * u.y + u.z * u.z;
    const Vec3 cross{
        u.y * v.z - u.z * v.y,
        u.z * v.x - u.x * v.z,
        u.x * v.y - u.y * v.x,
    };
    return {
        2.0f * dotUv * u.x + (s * s - dotUu) * v.x + 2.0f * s * cross.x,
        2.0f * dotUv * u.y + (s * s - dotUu) * v.y + 2.0f * s * cross.y,
        2.0f * dotUv * u.z + (s * s - dotUu) * v.z + 2.0f * s * cross.z,
    };
  }

  static Vec3 InverseRotate(const XrQuaternionf& q, const Vec3& v) {
    const XrQuaternionf inverse{-q.x, -q.y, -q.z, q.w};
    return Rotate(inverse, v);
  }

  static float Length(const Vec3& v) {
    return std::sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  }

  static Vec3 Normalize(const Vec3& v) {
    const float length = Length(v);
    if (length <= 0.00001f) return {0.0f, 0.0f, 0.0f};
    return {v.x / length, v.y / length, v.z / length};
  }

  static PixelRect LauncherRect(int width, int height) {
    return {
        static_cast<int>(width * 0.08f),
        static_cast<int>(height * 0.72f),
        static_cast<int>(width * 0.27f),
        static_cast<int>(height * 0.91f),
    };
  }

  bool RayToHudUv(
      const Vec3& originWorld,
      const Vec3& directionWorld,
      float& outU,
      float& outV) const {
    if (!headPoseValid_) return false;

    const Vec3 relative{
        originWorld.x - headPose_.position.x,
        originWorld.y - headPose_.position.y,
        originWorld.z - headPose_.position.z,
    };
    const Vec3 origin = InverseRotate(headPose_.orientation, relative);
    const Vec3 direction = InverseRotate(headPose_.orientation, directionWorld);

    if (std::abs(direction.z) < 0.0001f) return false;

    const float t = (-kHudDistanceMeters - origin.z) / direction.z;
    if (t <= 0.0f) return false;

    const float hitX = origin.x + direction.x * t;
    const float hitY = origin.y + direction.y * t;

    if (std::abs(hitX) > kHudWidthMeters * 0.5f ||
        std::abs(hitY) > kHudHeightMeters * 0.5f) {
      return false;
    }

    outU = hitX / kHudWidthMeters + 0.5f;
    outV = 0.5f - hitY / kHudHeightMeters;
    return true;
  }

  bool ResolvePointerUv(int side, float& outU, float& outV) const {
    if (!headPoseValid_ || side < 0 || side >= 2 || !pointerPoseValid_[side]) {
      return false;
    }

    const XrPosef& pointer = pointerPoses_[side];
    const Vec3 origin{pointer.position.x, pointer.position.y, pointer.position.z};

    // Primary path: controller aim orientation (and any hand pose whose orientation
    // happens to provide a usable aim ray).
    const Vec3 aim = Rotate(pointer.orientation, {0.0f, 0.0f, -1.0f});
    bool hit = RayToHudUv(origin, Normalize(aim), outU, outV);

    // Hand fallback: project the tracked hand position from the head onto the HUD plane.
    // This keeps direct XR_EXT_hand_tracking usable even when PICO does not expose a
    // profile-driven hand aim pose.
    if (!hit) {
      const Vec3 fromHead{
          pointer.position.x - headPose_.position.x,
          pointer.position.y - headPose_.position.y,
          pointer.position.z - headPose_.position.z,
      };
      const Vec3 headOrigin{
          headPose_.position.x,
          headPose_.position.y,
          headPose_.position.z,
      };
      hit = RayToHudUv(headOrigin, Normalize(fromHead), outU, outV);
    }

    return hit;
  }

  static bool UvHitsLauncher(float u, float v) {
    return u >= 0.08f && u <= 0.27f && v >= 0.72f && v <= 0.91f;
  }

  void UpdateHudHover() {
    bool anyHovered = false;

    for (int side = 0; side < 2; ++side) {
      float u = 0.0f;
      float v = 0.0f;
      const bool valid = ResolvePointerUv(side, u, v);
      const bool launcherHit = valid && UvHitsLauncher(u, v);

      const bool moved =
          valid &&
          (!pointerUvValid_[side] ||
           std::abs(u - pointerU_[side]) >= kPointerRedrawThreshold ||
           std::abs(v - pointerV_[side]) >= kPointerRedrawThreshold);
      const bool visibilityChanged = valid != pointerUvValid_[side];
      const bool hitChanged = launcherHit != launcherHit_[side];

      pointerUvValid_[side] = valid;
      if (valid) {
        pointerU_[side] = u;
        pointerV_[side] = v;
      }
      launcherHit_[side] = launcherHit;
      anyHovered = anyHovered || launcherHit;

      if (moved || visibilityChanged || hitChanged) {
        hudDirty_ = true;
      }
    }

    if (anyHovered != launcherHovered_) {
      launcherHovered_ = anyHovered;
      hudDirty_ = true;
      LOGI("HUD launcher hover=%s", launcherHovered_ ? "yes" : "no");
    }
  }

  static void SetPixel(
      std::vector<uint8_t>& rgba,
      int width,
      int height,
      int x,
      int y,
      uint8_t r,
      uint8_t g,
      uint8_t b,
      uint8_t a) {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const size_t index = (static_cast<size_t>(y) * width + x) * 4;
    rgba[index + 0] = r;
    rgba[index + 1] = g;
    rgba[index + 2] = b;
    rgba[index + 3] = a;
  }

  static void FillRect(
      std::vector<uint8_t>& rgba,
      int width,
      int height,
      const PixelRect& rect,
      uint8_t r,
      uint8_t g,
      uint8_t b,
      uint8_t a) {
    for (int y = std::max(0, rect.top); y < std::min(height, rect.bottom); ++y) {
      for (int x = std::max(0, rect.left); x < std::min(width, rect.right); ++x) {
        SetPixel(rgba, width, height, x, y, r, g, b, a);
      }
    }
  }

  static void StrokeRect(
      std::vector<uint8_t>& rgba,
      int width,
      int height,
      const PixelRect& rect,
      int thickness,
      uint8_t r,
      uint8_t g,
      uint8_t b,
      uint8_t a) {
    FillRect(rgba, width, height, {rect.left, rect.top, rect.right, rect.top + thickness}, r, g, b, a);
    FillRect(rgba, width, height, {rect.left, rect.bottom - thickness, rect.right, rect.bottom}, r, g, b, a);
    FillRect(rgba, width, height, {rect.left, rect.top, rect.left + thickness, rect.bottom}, r, g, b, a);
    FillRect(rgba, width, height, {rect.right - thickness, rect.top, rect.right, rect.bottom}, r, g, b, a);
  }

  static void DrawFilledCircle(
      std::vector<uint8_t>& rgba,
      int width,
      int height,
      int cx,
      int cy,
      int radius,
      uint8_t r,
      uint8_t g,
      uint8_t b,
      uint8_t a) {
    const int radiusSq = radius * radius;
    for (int y = cy - radius; y <= cy + radius; ++y) {
      for (int x = cx - radius; x <= cx + radius; ++x) {
        const int dx = x - cx;
        const int dy = y - cy;
        if (dx * dx + dy * dy <= radiusSq) {
          SetPixel(rgba, width, height, x, y, r, g, b, a);
        }
      }
    }
  }

  static void DrawCircleRing(
      std::vector<uint8_t>& rgba,
      int width,
      int height,
      int cx,
      int cy,
      int radius,
      int thickness,
      uint8_t r,
      uint8_t g,
      uint8_t b,
      uint8_t a) {
    const int outerSq = radius * radius;
    const int innerRadius = std::max(0, radius - thickness);
    const int innerSq = innerRadius * innerRadius;

    for (int y = cy - radius; y <= cy + radius; ++y) {
      for (int x = cx - radius; x <= cx + radius; ++x) {
        const int dx = x - cx;
        const int dy = y - cy;
        const int distanceSq = dx * dx + dy * dy;
        if (distanceSq <= outerSq && distanceSq >= innerSq) {
          SetPixel(rgba, width, height, x, y, r, g, b, a);
        }
      }
    }
  }

  static void DrawMenuGlyph(
      std::vector<uint8_t>& rgba,
      int width,
      int height,
      const PixelRect& rect) {
    const int marginX = (rect.right - rect.left) / 4;
    const int lineHeight = std::max(3, (rect.bottom - rect.top) / 18);
    const int centerY = (rect.top + rect.bottom) / 2;
    for (int offset : {-1, 0, 1}) {
      const int y = centerY + offset * (rect.bottom - rect.top) / 5;
      FillRect(
          rgba,
          width,
          height,
          {rect.left + marginX, y - lineHeight / 2, rect.right - marginX, y + lineHeight / 2 + 1},
          24,
          28,
          34,
          255);
    }
  }

  static void DrawCloseGlyph(
      std::vector<uint8_t>& rgba,
      int width,
      int height,
      const PixelRect& rect) {
    const int cx = (rect.left + rect.right) / 2;
    const int cy = (rect.top + rect.bottom) / 2;
    const int radius = (rect.right - rect.left) / 4;
    const int thickness = 4;
    for (int d = -radius; d <= radius; ++d) {
      for (int t = -thickness; t <= thickness; ++t) {
        SetPixel(rgba, width, height, cx + d, cy + d + t, 24, 28, 34, 255);
        SetPixel(rgba, width, height, cx + d, cy - d + t, 24, 28, 34, 255);
      }
    }
  }

  std::array<XrPosef, 2> pointerPoses_{};
  std::array<bool, 2> pointerPoseValid_{{false, false}};
  std::array<bool, 2> pointerUvValid_{{false, false}};
  std::array<float, 2> pointerU_{{0.0f, 0.0f}};
  std::array<float, 2> pointerV_{{0.0f, 0.0f}};
  std::array<int, 2> pointerPulseFrames_{{0, 0}};
  std::array<bool, 2> launcherHit_{{false, false}};
  XrPosef headPose_{};
  bool headPoseValid_{false};
  bool launcherHovered_{false};
  bool hudOpen_{false};
  bool hudDirty_{true};
};


ReadbackCheck::ReadbackCheck(const XrInstance& instance, const XrSession& session)
    : xr_instance(instance), xr_session(session) {}

ReadbackCheck::~ReadbackCheck() {
  keepRunning = false;
  if (readbackTexture != XR_NULL_HANDLE) {
    mReadbackController->ReleaseReadbackTexture(readbackTexture);
  }

  delete mReadbackController;
  if (pipelineInitializer && pipelineInitializer->joinable()) {
    pipelineInitializer->join();
  }
  for (auto& runner : pipelineRunners) {
    if (runner.joinable()) runner.join();
  }
}

void ReadbackCheck::CreateFramework() {
  LOGI("CreateFramework ...");
  frameworkSession = std::make_shared<FrameworkSession>(xr_instance, xr_session, 512, 512);
  LOGI("CreateFramework done");
}

void ReadbackCheck::CreatePipelines() {
  pipelineInitializer = std::make_unique<std::thread>([this]() {
    CreateGlobalTensor();
    CreateRelaxMrReadBackPipeline();
    initialized.notify_all();
    pipelineAllInitialized = true;
  });
}

void ReadbackCheck::CreateGlobalTensor() {
  if (isCpuBuffer) {
    vstOutputLeftUint8Global = std::make_shared<GlobalTensor>(
        frameworkSession,
        TensorAttribute{.dimensions = {512, 512},
                        .channels = 3,
                        .dataType = XR_SECURE_MR_TENSOR_DATA_TYPE_UINT8_PICO});
  } else {
    vstOutputLeftUint8Global = std::make_shared<GlobalTensor>(
        frameworkSession,
        TensorAttribute{.dimensions = {512, 512},
                        .channels = 3,
                        .usage = XR_SECURE_MR_TENSOR_TYPE_MAT_DYNAMIC_TEXTURE_PICO,
                        .dataType = XR_SECURE_MR_TENSOR_DATA_TYPE_DYNAMIC_TEXTURE_UINT8_PICO});
  }
  assert(vstOutputLeftUint8Global != nullptr);

  initializeGraphicsContext();
  mConfig.w = 512;
  mConfig.h = 512;
  mReadbackController = new ReadbackController(frameworkSession, vstOutputLeftUint8Global);
  mCurrentReadbackRequest = nullptr;
  LOGI("CreateGlobalTensor done");
}

void ReadbackCheck::Tick() {
  if (!pipelineAllInitialized || !gPermissionCamera || !gQrRecognitionEnabled.load()) return;

  if (isCpuBuffer) {
    if (!mCurrentReadbackRequest) {
      mReadbackController->RequestReadbackBuffer(mCurrentReadbackRequest);
    } else {
      auto result = new XrReadbackTensorBufferPICO();
      if (mReadbackController->TryAcquireReadbackBuffer(*mCurrentReadbackRequest, result)) {
        mCurrentReadbackRequest = nullptr;
        static uint64_t readbackFrameCount = 0;
        ++readbackFrameCount;
        if (readbackFrameCount == 1 || readbackFrameCount % 30 == 0) {
          LOGI("QR RGB readback frame %llu capacity=%llu",
               static_cast<unsigned long long>(readbackFrameCount),
               static_cast<unsigned long long>(result->bufferCapacityInput));
        }

        // Do not persist camera frames in the reusable scanner. Raw VST imagery is ephemeral.
        OutputReadbackBufferToFile(result, "");
        delete[] reinterpret_cast<char*>(result->buffer);
      }
      delete result;
    }
  } else {
    if (!mCurrentReadbackRequest) {
      mReadbackController->RequestReadbackTexture(mCurrentReadbackRequest);
    } else if (readbackTexture == XR_NULL_HANDLE) {
      if (mReadbackController->TryAcquireReadbackTexture(*mCurrentReadbackRequest, readbackTexture)) {
        mCurrentReadbackRequest = nullptr;
      }
    }
  }
}

void ReadbackCheck::RunPipelines() {
  pipelineRunners.emplace_back([this]() {
    {
      std::unique_lock<std::mutex> guard(initialized_mtx);
      initialized.wait(guard);
    }
    while (keepRunning) {
      RunRelaxMrReadBackPipeline();
      std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
  });
}

void ReadbackCheck::RequestPermission(struct android_app* app) {
  LOGI("QR scanner requesting CAMERA permission");
  ReadbackCheck::gapp = app;
  JNIEnv* env = nullptr;
  app->activity->vm->AttachCurrentThread(&env, nullptr);

  jobject activity = app->activity->clazz;
  jclass cls = env->GetObjectClass(activity);
  jmethodID mid = env->GetMethodID(cls, "requestCameraFromNative", "()V");
  env->CallVoidMethod(activity, mid);
  env->DeleteLocalRef(cls);
}

void ReadbackCheck::OutputReadbackBufferToFile(
    const XrReadbackTensorBufferPICO* tensorBuffer,
    const std::string&) {
  if (gapp == nullptr || tensorBuffer == nullptr || tensorBuffer->buffer == nullptr) return;

  const size_t expected = static_cast<size_t>(mConfig.w) * mConfig.h * 3;
  if (tensorBuffer->bufferCapacityInput < expected) {
    LOGE("Short readback buffer: %zu < %zu",
         static_cast<size_t>(tensorBuffer->bufferCapacityInput), expected);
    return;
  }

  JNIEnv* env = nullptr;
  bool detach = false;
  JavaVM* vm = gapp->activity->vm;
  const jint envStatus = vm->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6);
  if (envStatus == JNI_EDETACHED) {
    if (vm->AttachCurrentThread(&env, nullptr) != JNI_OK) return;
    detach = true;
  } else if (envStatus != JNI_OK) {
    return;
  }

  jobject activity = gapp->activity->clazz;
  jclass cls = env->GetObjectClass(activity);
  jmethodID mid = env->GetMethodID(cls, "onRgbFrame", "([BII)V");
  if (mid != nullptr) {
    jbyteArray frame = env->NewByteArray(static_cast<jsize>(expected));
    if (frame != nullptr) {
      env->SetByteArrayRegion(
          frame,
          0,
          static_cast<jsize>(expected),
          reinterpret_cast<const jbyte*>(tensorBuffer->buffer));
      env->CallVoidMethod(activity, mid, frame, mConfig.w, mConfig.h);
      env->DeleteLocalRef(frame);
    }
    if (env->ExceptionCheck()) {
      LOGE("Exception while delivering RGB frame to Java");
      env->ExceptionDescribe();
      env->ExceptionClear();
    }
  } else {
    LOGE("JNI onRgbFrame method not found");
    if (env->ExceptionCheck()) {
      env->ExceptionDescribe();
      env->ExceptionClear();
    }
  }
  env->DeleteLocalRef(cls);

  if (detach) {
    vm->DetachCurrentThread();
  }
}

void ReadbackCheck::CreateRelaxMrReadBackPipeline() {
  LOGI("CreateRelaxMrReadBackPipeline");
  m_RelaxMrReadBackPipeline = std::make_shared<Pipeline>(frameworkSession);
  vstOutputLeftUint8Placeholder =
      PipelineTensor::PipelinePlaceholderLike(m_RelaxMrReadBackPipeline, vstOutputLeftUint8Global);
  m_RelaxMrReadBackPipeline->cameraAccess(
      nullptr, vstOutputLeftUint8Placeholder, nullptr, nullptr);
}

XrSecureMrPipelineRunPICO ReadbackCheck::RunRelaxMrReadBackPipeline(
    const XrSecureMrPipelineRunPICO) {
  return m_RelaxMrReadBackPipeline->submit(
      {{vstOutputLeftUint8Placeholder, vstOutputLeftUint8Global}},
      XR_NULL_HANDLE,
      nullptr);
}

std::shared_ptr<ISecureMR> CreateSecureMrProgram(
    const XrInstance& instance,
    const XrSession& session) {
  return std::make_shared<QrReadbackCheck>(instance, session);
}

}  // namespace SecureMR
