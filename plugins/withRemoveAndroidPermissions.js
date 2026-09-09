// Local config plugin — strips Android permissions that Expo's default
// manifest template, expo-media-library's plugin, and Expo's own
// module-manifest autolinking step add unconditionally, but that this app
// doesn't use and that Play's abuse-detection weighs heavily (especially
// SYSTEM_ALERT_WINDOW paired with a payments feature).
//
// WHY THIS EXISTS: `expo prebuild --clean` regenerates
// android/app/src/main/AndroidManifest.xml from scratch every time, so a
// manual edit to that file does not survive the next prebuild. Before this
// plugin existed, these permissions were removed by hand after each
// prebuild (see the AndroidManifest.xml comment history) and silently came
// back the next time someone ran a clean prebuild. This plugin makes the
// removal a permanent, prebuild-safe part of the build instead of a manual
// step someone has to remember.
//
// - android.permission.SYSTEM_ALERT_WINDOW: comes from Expo's own base
//   manifest template (@expo/config-plugins' default "remove whatever you
//   don't need" scaffold permissions), not from any feature this app has.
//   A plain removal is enough — nothing re-adds it later in the pipeline.
// - android.permission.READ_MEDIA_AUDIO: expo-media-library's plugin
//   defaults to requesting photo+video+audio; this app has no audio-picker
//   feature. (Passing `granularPermissions: ['photo','video']` in
//   app.json's expo-media-library plugin config prevents this one at the
//   source — this removal is a defensive backstop.) Plain removal is enough.
// - android.permission.READ_EXTERNAL_STORAGE / WRITE_EXTERNAL_STORAGE:
//   expo-media-library, expo-file-system, and expo-image-picker each
//   declare these in their OWN library AndroidManifest.xml (superseded by
//   the scoped READ_MEDIA_* permissions this app already requests), and
//   Expo's prebuild re-adds a plain entry for any module-declared
//   permission not already present in the generated manifest as its very
//   last step — AFTER all app.json plugins (including this one) have run.
//   A plain removal here gets silently overwritten by that later step, so
//   these two need an explicit `tools:node="remove"` manifest-merge marker
//   instead: that (a) satisfies the "already present" check in Expo's
//   later re-add step (it matches by android:name, so it won't append a
//   second plain entry once a marker with the same name exists), and
//   (b) tells Android Gradle Plugin's manifest merger at actual build time
//   to drop the permission from the final compiled manifest regardless of
//   what any dependency's own library manifest declares — which a plain
//   removal from the app's own manifest cannot do on its own.
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const PLAIN_REMOVE = [
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.READ_MEDIA_AUDIO',
  'android.permission.ACCESS_MEDIA_LOCATION',
];

// Everything below needs the manifest-merge marker rather than a plain
// removal, because each is declared by a DEPENDENCY's own library manifest.
// A plain removal only edits this app's manifest; the merger would pull the
// permission back in from the library at build time.
//
// - READ_EXTERNAL_STORAGE / WRITE_EXTERNAL_STORAGE: see the note above.
//
// - CAMERA / RECORD_AUDIO: declared by expo-image-picker (and app.json's
//   permission list, now trimmed). The app never opens the camera or the
//   microphone — every call site is launchImageLibraryAsync /
//   requestMediaLibraryPermissionsAsync (lib/posts.ts, lib/channelVideos.ts,
//   lib/storage.ts). Shipping them anyway puts "take pictures and videos" and
//   "record audio" on the store listing for features that do not exist, which
//   is both a worse listing and the kind of unjustified-permission mismatch
//   review asks about. Re-add them here if a camera-capture feature is ever
//   built.
//
// - AD_ID and the ACCESS_ADSERVICES_* trio: pulled in by
//   react-native-google-mobile-ads. The SDK is linked but nothing renders an
//   ad — see the comment in lib/adsConfig.ts ("nothing currently renders a
//   BannerAd/interstitial"), and the configured unit IDs are still Google's
//   public test IDs. Keeping AD_ID would force a "collects Advertising ID for
//   advertising" entry in the Data Safety form describing behaviour the app
//   does not have. Removing it keeps the declaration honest.
//
//   IF ADS ARE TURNED ON LATER: delete the four ad entries from this list,
//   replace the test unit IDs in app.json, and update the Data Safety form to
//   declare Device or other IDs. All three go together.
const MERGE_REMOVE_MARKER = [
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'com.google.android.gms.permission.AD_ID',
  'android.permission.ACCESS_ADSERVICES_AD_ID',
  'android.permission.ACCESS_ADSERVICES_ATTRIBUTION',
  'android.permission.ACCESS_ADSERVICES_TOPICS',
];

module.exports = function withRemoveAndroidPermissions(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    AndroidConfig.Permissions.removePermissions(manifest, [...PLAIN_REMOVE, ...MERGE_REMOVE_MARKER]);
    const usesPermissions = manifest.manifest['uses-permission'] || [];
    for (const name of MERGE_REMOVE_MARKER) {
      usesPermissions.push({ $: { 'android:name': name, 'tools:node': 'remove' } });
    }
    manifest.manifest['uses-permission'] = usesPermissions;
    return config;
  });
};
