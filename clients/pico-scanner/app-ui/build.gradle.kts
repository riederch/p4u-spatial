plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "at.p4u.picovr.ui"
    compileSdk = 35

    defaultConfig {
        minSdk = 31
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation(project(":app-core"))
    implementation(platform("com.pico.spatial:bom:6.1.9"))
    implementation("com.pico.spatial.core:core")
    implementation("com.pico.spatial.tracking:tracking")
    implementation("com.pico.spatial.ui:foundation")
    implementation("com.pico.spatial.ui:platform")
    implementation("com.pico.spatial.ui:design")
    testImplementation("junit:junit:4.13.2")
}
