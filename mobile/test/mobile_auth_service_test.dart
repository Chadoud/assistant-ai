import 'dart:convert';

import 'package:exosites_mobile/features/auth/mobile_auth_service.dart';
import 'package:exosites_mobile/app/mobile_sync_config.dart';
import 'package:exosites_mobile/sync/key_value_store.dart';
import 'package:exosites_mobile/sync/local_store.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  test('isOAuthCallback requires exosites://oauth?exo_code=', () {
    expect(
      MobileAuthService.isOAuthCallback(Uri.parse('exosites://oauth?exo_code=abc')),
      isTrue,
    );
    expect(
      MobileAuthService.isOAuthCallback(Uri.parse('exosites://oauth')),
      isFalse,
    );
    expect(
      MobileAuthService.isOAuthCallback(Uri.parse('https://example.com/oauth?exo_code=abc')),
      isFalse,
    );
  });

  test('exchangeCode saves session tokens', () async {
    final storage = MemoryKeyValueStore();
    final store = LocalBrainStore(databasePath: ':memory:');
    final config = MobileSyncConfig(storage: storage, localStore: store);
    await config.hydrate();

    final client = MockClient((request) async {
      expect(request.url.path, '/auth/exchange');
      return http.Response(
        jsonEncode({
          'access_token': 'access-1',
          'refresh_token': 'refresh-1',
        }),
        200,
      );
    });

    final auth = MobileAuthService(config: config, httpClient: client);
    await auth.exchangeCode('code-1');
    expect(config.accessTokenSync, 'access-1');
    expect(storage.contains('refresh_token'), isTrue);
  });

  test('exchangeCode failure leaves session empty', () async {
    final storage = MemoryKeyValueStore();
    final store = LocalBrainStore(databasePath: ':memory:');
    final config = MobileSyncConfig(storage: storage, localStore: store);
    await config.hydrate();

    final client = MockClient((request) async => http.Response('nope', 400));
    final auth = MobileAuthService(config: config, httpClient: client);
    await expectLater(auth.exchangeCode('bad'), throwsException);
    expect(config.isSignedIn, isFalse);
  });

  test('loginWithPassword saves session tokens', () async {
    final storage = MemoryKeyValueStore();
    final store = LocalBrainStore(databasePath: ':memory:');
    final config = MobileSyncConfig(storage: storage, localStore: store);
    await config.hydrate();

    final client = MockClient((request) async {
      expect(request.url.path, '/auth/login');
      return http.Response(
        jsonEncode({
          'access_token': 'access-email',
          'refresh_token': 'refresh-email',
        }),
        200,
      );
    });

    final auth = MobileAuthService(config: config, httpClient: client);
    await auth.loginWithPassword(email: 'a@b.co', password: 'secret');
    expect(config.accessTokenSync, 'access-email');
  });

  test('apple and google sign-in URIs use cloud base', () {
    final storage = MemoryKeyValueStore();
    final store = LocalBrainStore(databasePath: ':memory:');
    final config = MobileSyncConfig(storage: storage, localStore: store);
    final auth = MobileAuthService(config: config);
    expect(auth.googleSignInUri().path, '/auth/mobile/start/google');
    expect(auth.appleSignInUri().path, '/auth/mobile/start/apple');
  });
}
