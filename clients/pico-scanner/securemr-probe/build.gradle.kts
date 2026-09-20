plugins {
    id("com.android.application")
}

android {
    namespace = "com.bytedance.pico.secure_mr_demo.readback"
    compileSdk = 35
    ndkVersion = "26.3.11579264"

    defaultConfig {
        applicationId = "at.p4u.spatial.securemrprobe"
        minSdk = 31
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"

        externalNativeBuild {
            cmake {
                arguments.add("-DANDROID_STL=c++_shared")
                arguments.add("-DANDROID_USE_LEGACY_TOOLCHAIN_FILE=OFF")
            }
            ndk {
                abiFilters.add("arm64-v8a")
            }
        }
    }

    buildTypes {
        debug {
            isDebuggable = true
            isJniDebuggable = true
        }
    }

    buildFeatures {
        prefab = true
    }

    externalNativeBuild {
        cmake {
            version = "3.22.1"
            path("CMakeLists.txt")
        }
    }

    packaging {
        jniLibs {
            keepDebugSymbols.add("**.so")
        }
    }
}


dependencies {
    implementation("com.google.zxing:core:3.5.3")
}
