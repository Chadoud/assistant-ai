/// Build-time and runtime configuration (flavors via --dart-define).
abstract final class ExoConfig {
  /// Keep in sync with `pubspec.yaml` version (name part before +build).
  static const appVersion = String.fromEnvironment(
    'APP_VERSION',
    defaultValue: '0.2.0',
  );

  static const cloudUrl = String.fromEnvironment(
    'EXOSITES_CLOUD_URL',
    defaultValue: 'https://api.exosites.ch',
  );

  static const flavor = String.fromEnvironment('FLAVOR', defaultValue: 'production');

  static const privacyPolicyUrl = String.fromEnvironment(
    'PRIVACY_POLICY_URL',
    defaultValue: 'https://exosites.ch/eng/app-privacy',
  );

  static const termsOfServiceUrl = String.fromEnvironment(
    'TERMS_OF_SERVICE_URL',
    defaultValue: 'https://exosites.ch/eng/app-terms',
  );

  static bool get isStaging => flavor == 'staging';

  static String get displayFlavor => isStaging ? 'Staging' : '';
}
