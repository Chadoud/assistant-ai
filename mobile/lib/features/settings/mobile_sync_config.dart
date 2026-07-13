import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:uuid/uuid.dart';

import '../../app/exo_config.dart';
import '../../sync/cloud_api.dart';
import '../../sync/sync_engine.dart';

/// Shared sync + auth configuration persisted in secure storage.
class MobileSyncConfig extends ChangeNotifier {
  MobileSyncConfig({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;
  static const _uuid = Uuid();

  String _cloudUrlSync = ExoConfig.cloudUrl;
  String _tokenSync = '';
  String _deviceIdSync = '';
  bool _paired = false;
  bool _crashReportsOptIn = false;

  String get cloudUrlSync => _cloudUrlSync;
  String get accessTokenSync => _tokenSync;
  String get deviceIdSync => _deviceIdSync;
  bool get isPaired => _paired;
  bool get crashReportsOptIn => _crashReportsOptIn;

  bool get isConfigured =>
      _cloudUrlSync.isNotEmpty && _tokenSync.isNotEmpty && _paired;

  SyncEngine get engine => SyncEngine(
        cloudUrl: _cloudUrlSync,
        accessToken: _tokenSync,
        deviceId: _deviceIdSync,
        storage: _storage,
      );

  CloudApi get api => CloudApi(baseUrl: _cloudUrlSync.replaceAll(RegExp(r'/$'), ''), accessToken: _tokenSync);

  Future<void> hydrate() async {
    _cloudUrlSync = await _storage.read(key: 'cloud_url') ?? ExoConfig.cloudUrl;
    _tokenSync = await _storage.read(key: 'access_token') ?? '';
    _paired = (await _storage.read(key: 'sync_paired')) == '1';
    _crashReportsOptIn = (await _storage.read(key: 'crash_reports_opt_in')) == '1';
    var deviceId = await _storage.read(key: 'device_id');
    if (deviceId == null || deviceId.isEmpty) {
      deviceId = 'mobile-${_uuid.v4()}';
      await _storage.write(key: 'device_id', value: deviceId);
    }
    _deviceIdSync = deviceId;
    notifyListeners();
  }

  Future<void> saveSession({
    required String accessToken,
    String? refreshToken,
    String? cloudUrl,
  }) async {
    _tokenSync = accessToken;
    if (refreshToken != null) {
      await _storage.write(key: 'refresh_token', value: refreshToken);
    }
    if (cloudUrl != null && cloudUrl.isNotEmpty) {
      _cloudUrlSync = cloudUrl;
      await _storage.write(key: 'cloud_url', value: cloudUrl);
    }
    await _storage.write(key: 'access_token', value: accessToken);
    notifyListeners();
  }

  /// Apply desktop QR pairing payload (master key + optional cloud URL).
  Future<void> applyPairingPayload(Map<String, dynamic> payload) async {
    final mk = payload['master_key_b64'] as String?;
    if (mk == null || mk.isEmpty) {
      throw ArgumentError('pairing payload missing master_key_b64');
    }
    await _storage.write(key: 'exosites_sync_master_key_b64', value: mk);
    final url = payload['cloud_url'] as String?;
    if (url != null && url.isNotEmpty) {
      _cloudUrlSync = url;
      await _storage.write(key: 'cloud_url', value: url);
    }
    await _storage.write(key: 'sync_paired', value: '1');
    _paired = true;
    notifyListeners();
  }

  Future<void> registerDeviceIfNeeded() async {
    if (!isConfigured) return;
    final platform = Platform.isIOS ? 'ios' : 'android';
    await api.registerDevice(
      deviceId: _deviceIdSync,
      name: Platform.isIOS ? 'iPhone' : 'Android',
      platform: platform,
    );
  }

  Future<void> setCrashReportsOptIn(bool enabled) async {
    _crashReportsOptIn = enabled;
    await _storage.write(key: 'crash_reports_opt_in', value: enabled ? '1' : '0');
    notifyListeners();
  }

  Future<void> clearSession() async {
    await _storage.delete(key: 'access_token');
    await _storage.delete(key: 'refresh_token');
    _tokenSync = '';
    notifyListeners();
  }
}
