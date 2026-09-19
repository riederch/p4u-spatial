plugins {
    id("com.android.application")
}

android {
    namespace = "at.p4u.spatial.scanner"
    compileSdk = 36

    defaultConfig {
        applicationId = "at.p4u.spatial.scanner"
        minSdk = 29
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    buildFeatures {
        buildConfig = true
    }

    sourceSets {
        getByName("main") {
            java.srcDir("../../android-pico-reference/src")
            res.srcDir("../../android-pico-reference/res")
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.19.0")
}
