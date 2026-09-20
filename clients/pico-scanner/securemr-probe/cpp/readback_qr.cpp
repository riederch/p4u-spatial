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
  return std::make_shared<ReadbackCheck>(instance, session);
}

}  // namespace SecureMR
