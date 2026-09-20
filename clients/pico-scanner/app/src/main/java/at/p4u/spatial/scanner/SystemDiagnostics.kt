package at.p4u.spatial.scanner

import android.app.ActivityManager
import android.content.Context
import android.content.pm.PackageManager
import android.content.pm.PackageInfo
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.util.DisplayMetrics
import android.util.Log
import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.Locale

/**
 * Startup diagnostics for picoVr.
 *
 * Dumps system/runtime information useful for PICO Spatial/OpenMR troubleshooting.
 * Potentially identifying values such as serial numbers, IMEI/MEID, MAC addresses and Android IDs
 * are deliberately redacted.
 */
object SystemDiagnostics {
    private const val TAG = "picoVr-System"

    private val sensitiveKeyFragments = listOf(
        "serial", "imei", "meid", "mac", "android_id", "device_id",
        "subscriber", "iccid", "imsi", "token", "secret"
    )

    fun dump(context: Context) {
        section("BEGIN picoVr startup diagnostics")
        basicBuild()
        androidRuntime()
        appInfo(context)
        display(context)
        memoryAndStorage(context)
        packageFeatures(context)
        cameraInfo(context)
        openMrPackageDiagnostics(context)
        spatialClasses()
        Thread {
            systemProperties()
            section("END picoVr startup diagnostics")
        }.apply { name = "picoVr-system-properties" }.start()
    }

    private fun basicBuild() {
        section("BUILD")
        line("MANUFACTURER", Build.MANUFACTURER)
        line("BRAND", Build.BRAND)
        line("MODEL", Build.MODEL)
        line("DEVICE", Build.DEVICE)
        line("PRODUCT", Build.PRODUCT)
        line("BOARD", Build.BOARD)
        line("HARDWARE", Build.HARDWARE)
        line("BOOTLOADER", Build.BOOTLOADER)
        line("DISPLAY", Build.DISPLAY)
        line("FINGERPRINT", Build.FINGERPRINT)
        line("ID", Build.ID)
        line("TYPE", Build.TYPE)
        line("TAGS", Build.TAGS)
        line("HOST", Build.HOST)
        line("USER", Build.USER)
        line("SUPPORTED_ABIS", Build.SUPPORTED_ABIS.joinToString())
        line("SUPPORTED_64_BIT_ABIS", Build.SUPPORTED_64_BIT_ABIS.joinToString())
        line("SUPPORTED_32_BIT_ABIS", Build.SUPPORTED_32_BIT_ABIS.joinToString())
    }

    private fun androidRuntime() {
        section("ANDROID / RUNTIME")
        line("SDK_INT", Build.VERSION.SDK_INT)
        line("RELEASE", Build.VERSION.RELEASE)
        line("INCREMENTAL", Build.VERSION.INCREMENTAL)
        line("SECURITY_PATCH", Build.VERSION.SECURITY_PATCH)
        line("BASE_OS", Build.VERSION.BASE_OS)
        line("CODENAME", Build.VERSION.CODENAME)
        line("java.version", System.getProperty("java.version"))
        line("java.vm.name", System.getProperty("java.vm.name"))
        line("java.vm.version", System.getProperty("java.vm.version"))
        line("os.arch", System.getProperty("os.arch"))
        line("os.name", System.getProperty("os.name"))
        line("os.version", System.getProperty("os.version"))
        line("locale", Locale.getDefault().toLanguageTag())
    }

    private fun appInfo(context: Context) {
        section("APPLICATION")
        val pm = context.packageManager
        val pkg = context.packageName
        val info = runCatching { pm.getPackageInfo(pkg, PackageManager.PackageInfoFlags.of(0)) }.getOrNull()
        val app = context.applicationInfo
        line("package", pkg)
        line("versionName", info?.versionName)
        line("versionCode", info?.longVersionCode)
        line("targetSdk", app.targetSdkVersion)
        line("minSdk", app.minSdkVersion)
        line("nativeLibraryDir", app.nativeLibraryDir)
        line("sourceDir", app.sourceDir)
        line("dataDir", app.dataDir)
        line("debuggable", (app.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0)
    }

    private fun display(context: Context) {
        section("DISPLAY")
        val dm: DisplayMetrics = context.resources.displayMetrics
        line("widthPixels", dm.widthPixels)
        line("heightPixels", dm.heightPixels)
        line("density", dm.density)
        line("densityDpi", dm.densityDpi)
        line("scaledDensity", dm.scaledDensity)
        line("xdpi", dm.xdpi)
        line("ydpi", dm.ydpi)
    }

    private fun memoryAndStorage(context: Context) {
        section("MEMORY / STORAGE")
        val am = context.getSystemService(ActivityManager::class.java)
        val mi = ActivityManager.MemoryInfo()
        am?.getMemoryInfo(mi)
        line("memory.totalBytes", mi.totalMem)
        line("memory.availableBytes", mi.availMem)
        line("memory.lowMemory", mi.lowMemory)
        line("runtime.maxMemory", Runtime.getRuntime().maxMemory())
        line("runtime.totalMemory", Runtime.getRuntime().totalMemory())
        line("runtime.freeMemory", Runtime.getRuntime().freeMemory())

        runCatching {
            val stat = StatFs(Environment.getDataDirectory().absolutePath)
            line("data.totalBytes", stat.totalBytes)
            line("data.availableBytes", stat.availableBytes)
        }.onFailure { error("storage", it) }
    }

    private fun packageFeatures(context: Context) {
        section("PACKAGE FEATURES")
        val pm = context.packageManager
        runCatching {
            pm.systemAvailableFeatures
                .mapNotNull { it.name }
                .sorted()
                .forEach { line("feature", it) }
        }.onFailure { error("features", it) }

        section("RELEVANT INSTALLED PACKAGES")
        runCatching {
            pm.getInstalledPackages(PackageManager.PackageInfoFlags.of(0))
                .asSequence()
                .map { it.packageName }
                .filter {
                    val n = it.lowercase()
                    n.contains("pico") || n.contains("pvr") || n.contains("bytedance") ||
                        n.contains("openmr") || n.contains("spatial") || n.contains("xr")
                }
                .sorted()
                .forEach { line("package", it) }
        }.onFailure { error("packages", it) }
    }

    private fun cameraInfo(context: Context) {
        section("CAMERAS")
        val manager = context.getSystemService(CameraManager::class.java)
        if (manager == null) {
            line("cameraManager", "unavailable")
            return
        }
        runCatching {
            line("cameraIdList", manager.cameraIdList.joinToString())
            manager.cameraIdList.forEach { id ->
                val c = manager.getCameraCharacteristics(id)
                line("camera[" + id + "].lensFacing", c.get(CameraCharacteristics.LENS_FACING))
                line("camera[" + id + "].hardwareLevel", c.get(CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL))
                line("camera[" + id + "].sensorOrientation", c.get(CameraCharacteristics.SENSOR_ORIENTATION))
                line("camera[" + id + "].capabilities", c.get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES)?.joinToString())
            }
        }.onFailure { error("cameras", it) }
    }

    private fun openMrPackageDiagnostics(context: Context) {
        section("OPENMR PACKAGE")
        val packageName = "com.bytedance.pico.openmr"
        val pm = context.packageManager

        val flags =
            PackageManager.PackageInfoFlags.of(
                (
                    PackageManager.GET_ACTIVITIES or
                        PackageManager.GET_SERVICES or
                        PackageManager.GET_PROVIDERS or
                        PackageManager.GET_RECEIVERS or
                        PackageManager.GET_PERMISSIONS or
                        PackageManager.GET_META_DATA
                ).toLong()
            )

        val info: PackageInfo? =
            runCatching { pm.getPackageInfo(packageName, flags) }
                .onFailure { error("openmr.packageInfo", it) }
                .getOrNull()

        if (info == null) {
            line("openmr.package", "NOT_VISIBLE")
            return
        }

        val app = info.applicationInfo
        line("openmr.versionName", info.versionName)
        line("openmr.versionCode", info.longVersionCode)
        line("openmr.firstInstallTime", info.firstInstallTime)
        line("openmr.lastUpdateTime", info.lastUpdateTime)
        line("openmr.application.enabled", app?.enabled)
        line("openmr.application.flags", app?.flags)
        line("openmr.application.uid", app?.uid)
        line("openmr.application.processName", app?.processName)
        line("openmr.application.sourceDir", app?.sourceDir)
        line("openmr.application.publicSourceDir", app?.publicSourceDir)
        line("openmr.application.nativeLibraryDir", app?.nativeLibraryDir)
        line("openmr.application.sharedLibraryFiles", app?.sharedLibraryFiles?.joinToString())
        line("openmr.application.metaData", app?.metaData?.keySet()?.sorted()?.joinToString())

        info.requestedPermissions?.sorted()?.forEach { line("openmr.permission", it) }

        info.activities?.sortedBy { it.name }?.forEach {
            line(
                "openmr.activity",
                it.name + "|exported=" + it.exported + "|permission=" + it.permission + "|process=" + it.processName
            )
        }
        info.services?.sortedBy { it.name }?.forEach {
            line(
                "openmr.service",
                it.name + "|exported=" + it.exported + "|permission=" + it.permission + "|process=" + it.processName
            )
        }
        info.providers?.sortedBy { it.name }?.forEach {
            line(
                "openmr.provider",
                it.name + "|authority=" + it.authority + "|exported=" + it.exported +
                    "|readPermission=" + it.readPermission + "|writePermission=" + it.writePermission +
                    "|process=" + it.processName
            )
        }
        info.receivers?.sortedBy { it.name }?.forEach {
            line(
                "openmr.receiver",
                it.name + "|exported=" + it.exported + "|permission=" + it.permission + "|process=" + it.processName
            )
        }

        section("OPENMR FOREIGN CLASSLOADER PROBE")
        runCatching {
            val foreign =
                context.createPackageContext(
                    packageName,
                    Context.CONTEXT_INCLUDE_CODE or Context.CONTEXT_IGNORE_SECURITY,
                )
            line("openmr.foreignContext.packageName", foreign.packageName)
            line("openmr.foreignContext.classLoader", foreign.classLoader.javaClass.name)

            listOf(
                "com.bytedance.pico.openmr.spatial.pack.SSMRConnection",
                "com.bytedance.pico.openmr.spatial.pack.SSMRConnection$Companion",
            ).forEach { name ->
                val probe = runCatching { foreign.classLoader.loadClass(name) }
                val state =
                    if (probe.isSuccess) {
                        "FOUND in " + (probe.getOrNull()?.protectionDomain?.codeSource?.location ?: "foreign package")
                    } else {
                        "MISSING: " + probe.exceptionOrNull()?.javaClass?.simpleName
                    }
                line("openmr.foreignClass[" + name + "]", state)
            }
        }.onFailure { error("openmr.foreignContext", it) }
    }

    private fun spatialClasses() {
        section("SPATIAL / OPENMR CLASS PROBES")
        listOf(
            "com.pico.spatial.ui.platform.stub.SpatialLaunchActivity",
            "com.pico.spatial.ml.securemr.SpatialMLInstance",
            "com.pico.spatial.ml.securemr.SpatialMLSession",
            "com.pico.spatial.foundation.extensions.applog.StatisticsReporter",
            "com.bytedance.pico.openmr.spatial.pack.SSMRConnection",
        ).forEach { name ->
            val result = runCatching { Class.forName(name, false, SystemDiagnostics::class.java.classLoader) }
            val state = if (result.isSuccess) "FOUND" else "MISSING: " + result.exceptionOrNull()?.javaClass?.simpleName
            line("class[" + name + "]", state)
        }
    }

    private fun systemProperties() {
        section("SYSTEM PROPERTIES (getprop)")
        runCatching {
            val process = ProcessBuilder("getprop").redirectErrorStream(true).start()
            BufferedReader(InputStreamReader(process.inputStream)).useLines { lines ->
                lines.forEach { raw ->
                    val lower = raw.lowercase()
                    if (sensitiveKeyFragments.any { lower.contains(it) }) {
                        val key = raw.substringBefore("]:").ifBlank { raw.substringBefore(":") }
                        Log.i(TAG, key + ": [REDACTED]")
                    } else {
                        Log.i(TAG, raw)
                    }
                }
            }
            process.waitFor()
            line("getprop.exitCode", process.exitValue())
        }.onFailure { error("getprop", it) }
    }

    private fun section(name: String) = Log.i(TAG, "===== " + name + " =====")
    private fun line(key: String, value: Any?) = Log.i(TAG, key + "=" + value)
    private fun error(area: String, t: Throwable) = Log.e(TAG, area + " failed: " + t.javaClass.simpleName + ": " + t.message)
}
