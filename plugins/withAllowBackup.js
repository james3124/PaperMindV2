const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Sets android:allowBackup="false" so the user's document library is not
 * extractable via ADB/cloud backup. Survives `expo prebuild --clean`.
 */
module.exports = function withAllowBackup(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (app) {
      app.$['android:allowBackup'] = 'false';
      app.$['android:fullBackupContent'] = 'false';
    }
    return cfg;
  });
};
