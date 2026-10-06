package com.cloudlynk.app

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import com.facebook.react.bridge.*
import com.google.android.gms.tasks.Tasks
import com.google.android.play.core.integrity.IntegrityManagerFactory
import java.io.File

class FingerprintModule(private val reactContext: ReactApplicationContext) : ReactContextBaseModule(reactContext) {
  override fun getName() = "Fingerprint"

  @ReactMethod
  fun detectRoot(promise: Promise) {
    try {
      val isRooted = checkRootAccess() || checkSuspiciousApps() || checkSuspiciousProperties()
      promise.resolve(isRooted)
    } catch (e: Exception) {
      promise.reject("DETECT_ROOT_ERROR", e.message)
    }
  }

  @ReactMethod
  fun getPlayIntegrityToken(nonce: String, promise: Promise) {
    try {
      val context = reactApplicationContext
      val integrityManager = IntegrityManagerFactory.create(context)

      val tokenRequest = com.google.android.play.core.integrity.IntegrityTokenRequest.builder()
        .setNonce(nonce)
        .build()

      val tokenResponse = Tasks.await(integrityManager.requestIntegrityToken(tokenRequest))
      val token = tokenResponse.token()

      val result = Arguments.createMap().apply {
        putString("token", token)
        putString("method", "play_integrity")
      }
      promise.resolve(result)
    } catch (e: Exception) {
      // Fallback to empty token on error
      val result = Arguments.createMap().apply {
        putString("token", "")
        putString("method", "none")
        putString("error", e.message)
      }
      promise.resolve(result)
    }
  }

  @ReactMethod
  fun getPlayInstallReferrer(promise: Promise) {
    try {
      val context = reactApplicationContext
      val referrerClient = com.android.installreferrer.api.InstallReferrerClient.newBuilder(context).build()

      referrerClient.startConnection(object : com.android.installreferrer.api.InstallReferrerStateListener {
        override fun onInstallReferrerSetupFinished(responseCode: Int) {
          try {
            if (responseCode == com.android.installreferrer.api.InstallReferrerClient.InstallReferrerResponse.OK) {
              val referrerDetails = referrerClient.installReferrer
              val referrer = referrerDetails?.installReferrer ?: ""
              val referrerClickTs = referrerDetails?.referrerClickTimestampSeconds ?: 0L
              val installBeginTs = referrerDetails?.installBeginTimestampSeconds ?: 0L

              val result = Arguments.createMap().apply {
                putString("referrer", referrer)
                putDouble("referrerClickTimestamp", referrerClickTs.toDouble())
                putDouble("installBeginTimestamp", installBeginTs.toDouble())
              }
              promise.resolve(result)
            } else {
              val result = Arguments.createMap().apply {
                putString("referrer", "")
                putString("error", "Failed to get referrer")
              }
              promise.resolve(result)
            }
          } catch (e: Exception) {
            promise.reject("REFERRER_ERROR", e.message)
          } finally {
            referrerClient.endConnection()
          }
        }

        override fun onInstallReferrerServiceDisconnected() {
          promise.reject("REFERRER_DISCONNECTED", "Install referrer service disconnected")
        }
      })
    } catch (e: Exception) {
      promise.reject("REFERRER_FAILED", e.message)
    }
  }

  private fun checkRootAccess(): Boolean {
    // Check if device has root access via common methods
    val rootPaths = arrayOf(
      "/system/app/Superuser.apk",
      "/sbin/su",
      "/system/bin/su",
      "/system/xbin/su",
      "/data/local/xbin/su",
      "/data/local/bin/su",
      "/system/sd/xbin/su",
      "/system/bin/failsafe/su",
      "/data/local/su"
    )

    for (path in rootPaths) {
      if (File(path).exists()) return true
    }

    // Check for root packages
    val pm = reactApplicationContext.packageManager
    val rootApps = arrayOf(
      "com.topjohnwu.magisk",
      "io.github.vvb2060.magisk",
      "com.noshufou.android.su",
      "com.noshufou.android.su.elite",
      "eu.chainfire.supersu",
      "com.kingouser.com",
      "com.kingo.root"
    )

    for (app in rootApps) {
      try {
        pm.getApplicationInfo(app, PackageManager.GET_META_DATA)
        return true
      } catch (e: PackageManager.NameNotFoundException) {
        // App not found
      }
    }

    return false
  }

  private fun checkSuspiciousApps(): Boolean {
    val pm = reactApplicationContext.packageManager
    val suspiciousApps = arrayOf(
      "com.android.vending.billing.IInAppBillingService",
      "com.mwr.example.sieve",
      "com.example.vulnerable"
    )

    for (app in suspiciousApps) {
      try {
        pm.getApplicationInfo(app, PackageManager.GET_META_DATA)
        return true
      } catch (e: PackageManager.NameNotFoundException) {
        // Not found
      }
    }

    return false
  }

  private fun checkSuspiciousProperties(): Boolean {
    // Check for common emulator/testing properties
    val suspiciousProps = mapOf(
      "ro.kernel.android.checkjni" to "0",
      "ro.debuggable" to "1",
      "ro.secure" to "0",
      "ro.allow.mock.location" to "1",
      "ro.boot.serialno" to "unknown"
    )

    return suspiciousProps.any { (key, value) ->
      try {
        val prop = System.getProperty(key) ?: ""
        prop.contains(value, ignoreCase = true)
      } catch (e: Exception) {
        false
      }
    }
  }
}
