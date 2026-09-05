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

const MERGE_REMOVE_MARKER = [
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
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
