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

namespace SecureMR {

#ifdef XR_READBACK_USE_CPU
bool ReadbackCheck::isCpuBuffer = true;
#else
bool ReadbackCheck::isCpuBuffer = false;
#endif

struct android_app* ReadbackCheck::gapp = nullptr;

class QrReadbackCheck final : public ReadbackCheck {
 public:
  QrReadbackCheck(const XrInstance& instance, const XrSession& session)
      : ReadbackCheck(instance, session) {}

  [[nodiscard]] bool WantsScanOverlay() const override { return true; }

  bool UpdateOverlayRgba(
      int width,
      int height,
      std::vector<uint8_t>& outRgba) override {
    if (overlayGenerated_ || width <= 0 || height <= 0) {
      return false;
    }

    outRgba.assign(static_cast<size_t>(width) * height * 4, 0);

    // Samsung-style scanner guidance: four neutral corner brackets, no alarming full red box.
    const int rectW = width * 500 / 1024;
    const int rectH = height * 500 / 1024;
    const int left = (width - rectW) / 2;
    const int top = (height - rectH) / 2 - height * 100 / 1024;
    const int right = left + rectW - 1;
    const int bottom = top + rectH - 1;
    const int thickness = std::max(4, width * 10 / 1024);
    const int cornerLength = std::max(32, std::min(rectW, rectH) / 5);

    auto setPixel = [&](int x, int y) {
      if (x < 0 || x >= width || y < 0 || y >= height) return;
      const size_t idx = (static_cast<size_t>(y) * width + x) * 4;
      outRgba[idx + 0] = 255;
      outRgba[idx + 1] = 255;
      outRgba[idx + 2] = 255;
      outRgba[idx + 3] = 230;
    };

    auto drawHorizontal = [&](int x0, int x1, int y, int direction) {
      for (int t = 0; t < thickness; ++t) {
        const int yy = y + direction * t;
        for (int x = x0; x <= x1; ++x) setPixel(x, yy);
      }
    };
    auto drawVertical = [&](int x, int y0, int y1, int direction) {
      for (int t = 0; t < thickness; ++t) {
        const int xx = x + direction * t;
        for (int y = y0; y <= y1; ++y) setPixel(xx, y);
      }
    };

    drawHorizontal(left, left + cornerLength, top, +1);
    drawVertical(left, top, top + cornerLength, +1);

    drawHorizontal(right - cornerLength, right, top, +1);
    drawVertical(right, top, top + cornerLength, -1);

    drawHorizontal(left, left + cornerLength, bottom, -1);
    drawVertical(left, bottom - cornerLength, bottom, +1);

    drawHorizontal(right - cornerLength, right, bottom, -1);
    drawVertical(right, bottom - cornerLength, bottom, -1);

    overlayGenerated_ = true;
    return true;
  }

 private:
  bool overlayGenerated_ = false;
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
  if (!pipelineAllInitialized || !gPermissionCamera) return;

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
