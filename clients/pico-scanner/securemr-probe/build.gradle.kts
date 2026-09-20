plugins {
    id("com.android.library")
}

android {
    namespace = "com.bytedance.pico.secure_mr_demo.readback"
    compileSdk = 35
    ndkVersion = "26.3.11579264"

    defaultConfig {
        minSdk = 31

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
