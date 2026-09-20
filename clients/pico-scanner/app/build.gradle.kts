plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val releaseVersionCode = providers.gradleProperty("P4U_VERSION_CODE").orNull?.toIntOrNull() ?: 1
val releaseVersionName = providers.gradleProperty("P4U_VERSION_NAME").orNull ?: "0.1.0"

android {
    namespace = "at.p4u.spatial.scanner"
    compileSdk = 35

    defaultConfig {
        applicationId = "at.p4u.spatial.scanner"
        minSdk = 31
        targetSdk = 35
        versionCode = releaseVersionCode
        versionName = releaseVersionName
        ndk { abiFilters.add("arm64-v8a") }
    }

    signingConfigs {
        create("release") {
            val keystorePath = System.getenv("P4U_ANDROID_KEYSTORE_PATH")
            if (!keystorePath.isNullOrBlank()) {
                storeFile = file(keystorePath)
                storePassword = System.getenv("P4U_ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("P4U_ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("P4U_ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        getByName("release") {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = false
        }
    }

    buildFeatures {
        buildConfig = true
        compose = true
    }

    sourceSets {
        getByName("main") {
            kotlin.directories.add("../../android-pico-reference/src")
            res.directories.add("../../android-pico-reference/res")
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation(platform("com.pico.spatial:bom:6.1.9"))
    implementation("com.pico.spatial.core:core")
    implementation("com.pico.spatial.ml:securemr")
    implementation("com.pico.spatial.ml:readback")
    implementation("com.pico.spatial.ui:foundation")
    implementation("com.pico.spatial.ui:platform")
    implementation("com.pico.spatial.ui:design")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("com.google.zxing:core:3.5.3")
}
