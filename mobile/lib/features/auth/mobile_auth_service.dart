import 'dart:convert';

import 'package:app_links/app_links.dart';
import 'package:http/http.dart' as http;

import '../../app/exo_config.dart';
import '../settings/mobile_sync_config.dart';

/// Handles mobile OAuth deep links (`exosites://oauth?exo_code=...`).
class MobileAuthService {
  MobileAuthService({required this.config, AppLinks? appLinks})
      : _appLinks = appLinks ?? AppLinks();

  final MobileSyncConfig config;
  final AppLinks _appLinks;

  Future<void> startListening() async {
    final initial = await _appLinks.getInitialLink();
    if (initial != null) {
      await _handleUri(initial);
    }
    _appLinks.uriLinkStream.listen(_handleUri);
  }

  Future<void> _handleUri(Uri uri) async {
    if (uri.scheme != 'exosites' || uri.host != 'oauth') return;
    final code = uri.queryParameters['exo_code'];
    if (code == null || code.isEmpty) return;
    await exchangeCode(code);
  }

  Future<void> exchangeCode(String code) async {
    final base = config.cloudUrlSync.replaceAll(RegExp(r'/$'), '');
    final res = await http.post(
      Uri.parse('$base/auth/exchange'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'code': code}),
    );
    if (res.statusCode >= 400) {
      throw Exception('Sign-in failed');
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    await config.saveSession(
      accessToken: data['access_token'] as String,
      refreshToken: data['refresh_token'] as String?,
      cloudUrl: ExoConfig.cloudUrl,
    );
    await config.registerDeviceIfNeeded();
  }

  Uri googleSignInUri() {
    final base = config.cloudUrlSync.replaceAll(RegExp(r'/$'), '');
    return Uri.parse('$base/auth/mobile/start/google');
  }
}
