const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Keeps the signing key out of source control. GitHub Actions supplies these
 * environment variables only while creating a release APK.
 */
module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error('Android release signing expects a Groovy app/build.gradle file.');
    }

    const original = config.modResults.contents;
    const signingConfigsMatch = /signingConfigs\s*\{\s*/;
    const releaseBuildSigningMatch = /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/;

    if (!signingConfigsMatch.test(original) || !releaseBuildSigningMatch.test(original)) {
      throw new Error('Unable to add GitHub Actions release signing to app/build.gradle.');
    }

    const releaseSigningConfig = `release {
            def releaseStoreFile = System.getenv("ANDROID_KEYSTORE_PATH")
            if (releaseStoreFile != null) {
                storeFile file(releaseStoreFile)
                storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias System.getenv("ANDROID_KEY_ALIAS")
                keyPassword System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
        `;

    config.modResults.contents = original
      .replace(signingConfigsMatch, (match) => `${match}${releaseSigningConfig}`)
      .replace(releaseBuildSigningMatch, '$1signingConfig System.getenv("ANDROID_KEYSTORE_PATH") != null ? signingConfigs.release : signingConfigs.debug');

    return config;
  });
};
