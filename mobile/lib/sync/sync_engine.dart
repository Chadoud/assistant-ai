import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'cloud_api.dart';
import 'local_store.dart';
import 'sync_crypto.dart';
import 'sync_errors.dart';

/// Mobile GO SYNC engine — pull encrypted blobs, decrypt, cache locally.
class SyncEngine {
  SyncEngine({
    required this.cloudUrl,
    required this.accessToken,
    required this.deviceId,
    FlutterSecureStorage? storage,
  }) : _storage = storage ?? const FlutterSecureStorage();

  final String cloudUrl;
  final String accessToken;
  final String deviceId;
  final FlutterSecureStorage _storage;

  static const _masterKeyKey = 'exosites_sync_master_key_b64';

  CloudApi get _api => CloudApi(baseUrl: cloudUrl.replaceAll(RegExp(r'/$'), ''), accessToken: accessToken);

  LocalBrainStore get localStore => LocalBrainStore();

  Future<Uint8List> masterKey() async {
    final b64 = await _storage.read(key: _masterKeyKey);
    if (b64 == null || b64.isEmpty) {
      throw SyncNotPairedException();
    }
    return Uint8List.fromList(base64Decode(b64));
  }

  Future<Map<String, dynamic>> pullAndDecrypt({int cursor = 0}) async {
    final pulled = await _api.pullBlobs(cursor: cursor);
    final blobs = (pulled['blobs'] as List<dynamic>? ?? []).cast<Map<String, dynamic>>();
    final mk = await masterKey();
    final decoded = <Map<String, dynamic>>[];
    for (final env in blobs) {
      decoded.add(await _decryptEnvelope(env, mk));
    }
    return {
      'records': decoded,
      'cursor': pulled['cursor'] ?? cursor,
      'has_more': pulled['has_more'] ?? false,
    };
  }

  Future<Map<String, dynamic>> pushLocalRecords(List<Map<String, dynamic>> items) async {
    final mk = await masterKey();
    final envelopes = <Map<String, dynamic>>[];
    for (final item in items) {
      envelopes.add(await _encryptItem(item, mk));
    }
    if (envelopes.isEmpty) {
      return {'accepted': 0, 'cursor': 0};
    }
    return _api.pushBlobs(envelopes);
  }

  Future<Map<String, dynamic>> _encryptItem(Map<String, dynamic> item, Uint8List mk) async {
    final collection = item['collection'] as String;
    final recordId = item['record_id'] as String;
    final updatedAt = item['updated_at'] as String;
    final payload = utf8.encode(jsonEncode(item['payload']));
    final rkey = await SyncCrypto.recordKey(mk, collection, recordId);
    return SyncCrypto.buildEnvelope(
      collection: collection,
      recordId: recordId,
      deviceId: deviceId,
      logicalClock: SyncCrypto.logicalClock(updatedAt, recordId),
      updatedAt: updatedAt,
      plaintext: Uint8List.fromList(payload),
      recordKey: rkey,
    );
  }

  Future<Map<String, dynamic>> _decryptEnvelope(Map<String, dynamic> env, Uint8List mk) async {
    final collection = env['collection'] as String;
    final recordId = env['record_id'] as String;
    final rkey = await SyncCrypto.recordKey(mk, collection, recordId);
    final plain = await SyncCrypto.decryptRecord(env['ciphertext'] as String, rkey);
    return {
      'collection': collection,
      'record_id': recordId,
      'payload': jsonDecode(utf8.decode(plain)),
      'deleted': env['deleted'] ?? false,
    };
  }
}
