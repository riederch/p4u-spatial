plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
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

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    kotlinOptions {
        jvmTarget = "1.8"
    }
}

dependencies {
    implementation(project(":qr-reader"))
    implementation(platform("com.pico.spatial:bom:6.1.9"))
    implementation("com.pico.spatial.ml:securemr")
    implementation("com.pico.spatial.ml:readback")
    implementation("com.google.zxing:core:3.5.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
}
