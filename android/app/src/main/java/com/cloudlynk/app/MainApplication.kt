package com.cloudlynk.app

import android.app.Application
import android.content.res.Configuration

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        }
    )
  }

  override fun onCreate() {
    super.onCreate()
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
    startMetaSdk()
  }

  // Meta ad measurement (installs, app opens, sign-ups, purchases). Started
  // here rather than by the SDK's own auto-init, because the app ID comes from
  // app.json via BuildConfig, and a build without one must send nothing: with
  // no ID this returns before touching the SDK. Auto-init is off in the
  // manifest for the same reason.
  private fun startMetaSdk() {
    val appId = BuildConfig.META_APP_ID
    val token = BuildConfig.META_CLIENT_TOKEN
    if (appId.isBlank() || token.isBlank()) return
    try {
      com.facebook.FacebookSdk.setApplicationId(appId)
      com.facebook.FacebookSdk.setClientToken(token)
      com.facebook.FacebookSdk.setAutoInitEnabled(true)
      @Suppress("DEPRECATION")
      com.facebook.FacebookSdk.sdkInitialize(this)
      com.facebook.FacebookSdk.fullyInitialize()
      // Respects the Settings opt-out, which the SDK keeps across launches.
      if (com.facebook.FacebookSdk.getAutoLogAppEventsEnabled()) {
        com.facebook.appevents.AppEventsLogger.activateApp(this)
      }
    } catch (e: Exception) {
      android.util.Log.w("Cloudlynk", "Meta SDK did not start", e)
    }
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
