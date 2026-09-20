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

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    kotlinOptions {
        jvmTarget = "1.8"
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
    // PICO 4 Ultra / PICO OS 5.x uses the pre-OS6 Spatial SDK line.
    // The 6.x SpatialML runtime expects OS6 OpenMR classes (for example SSMRConnection)
    // which are not present on PICO 4 Ultra's OpenMR system package.
    implementation(platform("com.pico.spatial:spatial-bom:0.13.3"))
    implementation("com.pico.spatial:spatial-core")
    implementation("com.pico.spatial.ml:spatial-ml-securemr")
    implementation("com.pico.spatial.ml:spatial-ml-readback")
    implementation("com.pico.spatial.ui:spatial-ui-foundation")
    implementation("com.pico.spatial.ui:spatial-ui-platform")
    implementation("com.pico.spatial.ui:spatial-ui-design")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("com.google.zxing:core:3.5.3")
}
