plugins {
    id("com.android.application")
}

val releaseVersionCode = providers.gradleProperty("P4U_VERSION_CODE").orNull?.toIntOrNull() ?: 1
val releaseVersionName = providers.gradleProperty("P4U_VERSION_NAME").orNull ?: "0.1.0"

android {
    namespace = "at.p4u.spatial.scanner"
    compileSdk = 36

    defaultConfig {
        applicationId = "at.p4u.spatial.scanner"
        minSdk = 29
        targetSdk = 36
        versionCode = releaseVersionCode
        versionName = releaseVersionName
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
    }

    sourceSets {
        getByName("main") {
            kotlin.srcDir("../../android-pico-reference/src")
            res.srcDir("../../android-pico-reference/res")
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.19.0")
}
