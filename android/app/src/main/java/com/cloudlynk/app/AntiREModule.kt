package com.cloudlynk.app

import android.content.Context
import android.os.Debug
import com.facebook.react.bridge.*
import java.io.File

class AntiREModule(private val reactContext: ReactApplicationContext) : ReactContextBaseModule(reactContext) {
  override fun getName() = "AntiRE"

  @ReactMethod
  fun detectFrida(promise: Promise) {
    try {
      val fridaDetected = checkFridaPresence()
      promise.resolve(fridaDetected)
    } catch (e: Exception) {
      promise.reject("DETECT_FRIDA_ERROR", e.message)
    }
  }

  @ReactMethod
  fun detectDebugger(promise: Promise) {
    try {
      val debuggerDetected = isDebuggerConnected()
      promise.resolve(debuggerDetected)
    } catch (e: Exception) {
      promise.reject("DETECT_DEBUGGER_ERROR", e.message)
    }
  }

  @ReactMethod
  fun detectHookingFramework(promise: Promise) {
    try {
      val hookingDetected = checkForHookingFrameworks()
      promise.resolve(hookingDetected)
    } catch (e: Exception) {
      promise.reject("DETECT_HOOKING_ERROR", e.message)
    }
  }

  private fun checkFridaPresence(): Boolean {
    val fridaPaths = arrayOf(
      "/system/lib/libfrida.so",
      "/system/lib64/libfrida.so",
      "/data/local/tmp/frida-server",
      "/system/xbin/frida-server"
    )

    for (path in fridaPaths) {
      if (File(path).exists()) {
        return true
      }
    }

    // Check for frida in process maps
    try {
      val mapsFile = File("/proc/self/maps")
      if (mapsFile.exists()) {
        val maps = mapsFile.readText()
        if (maps.contains("frida")) {
          return true
        }
      }
    } catch (e: Exception) {
      // Ignore
    }

    return false
  }

  private fun isDebuggerConnected(): Boolean {
    // Check if debugger is attached via Debug class
    if (Debug.isDebuggerConnected()) {
      return true
    }

    // Check system properties for debug flags
    try {
      val debugProp = System.getProperty("ro.debuggable")
      if (debugProp == "1") {
        return true
      }
    } catch (e: Exception) {
      // Ignore
    }

    return false
  }

  private fun checkForHookingFrameworks(): Boolean {
    val suspiciousPackages = arrayOf(
      "com.saurik.substrate",
      "de.robv.android.xposed.installer",
      "com.xposedmod",
      "io.va.exposed",
      "com.android.hook"
    )

    val pm = reactApplicationContext.packageManager

    for (pkg in suspiciousPackages) {
      try {
        pm.getApplicationInfo(pkg, 0)
        return true // Package found, likely hooked
      } catch (e: Exception) {
        // Package not found
      }
    }

    // Check for xposed hooks in /system/framework/
    try {
      if (File("/system/framework/XposedBridge.jar").exists()) {
        return true
      }
    } catch (e: Exception) {
      // Ignore
    }

    return false
  }
}
