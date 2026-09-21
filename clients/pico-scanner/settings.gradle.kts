pluginManagement {
    repositories {
        google()
        mavenCentral()
        maven { url = uri("https://artifact.bytedance.com/repository/Volcengine") }
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        maven { url = uri("https://artifact.bytedance.com/repository/Volcengine") }
    }
}

rootProject.name = "P4USpatialScanner"
include(":app")
include(":app-core")
include(":app-ui")
include(":qr-reader")
include(":qr-reader-ui")
include(":securemr-probe")
