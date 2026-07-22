import 'dart:convert';
import 'dart:typed_data';

import 'cloud_api.dart';
import 'key_value_store.dart';
import 'local_store.dart';
import 'sync_crypto.dart';
import 'sync_errors.dart';

/// Result of pulling until the relay reports no more pages.
class SyncPullResult {
  const SyncPullResult({
    required this.appliedCount,
    required this.deletedCount,
    required this.cursor,
  });

  final int appliedCount;
  final int deletedCount;
  final int cursor;
}

/// Mobile GO SYNC engine — pull encrypted blobs, decrypt, cache locally.
class SyncEngine {
  SyncEngine({
    required this.cloudUrl,
    required this.accessToken,
    required this.deviceId,
    required CloudApi api,
    required KeyValueStore storage,
    LocalBrainStore? localStore,
  })  : _api = api,
        _storage = storage,
        _localStore = localStore ?? LocalBrainStore();

  final String cloudUrl;
  final String accessToken;
  final String deviceId;
  final CloudApi _api;
  final KeyValueStore _storage;
  final LocalBrainStore _localStore;

  static const _masterKeyKey = 'exosites_sync_master_key_b64';
  static const cursorStorageKey = 'sync_pull_cursor';

  LocalBrainStore get localStore => _localStore;

  Future<Uint8List> masterKey() async {
    final b64 = await _storage.read(_masterKeyKey);
    if (b64 == null || b64.isEmpty) {
      throw SyncNotPairedException();
    }
    return Uint8List.fromList(base64Decode(b64));
  }

  Future<int> readCursor() async {
    final raw = await _storage.read(cursorStorageKey);
    if (raw == null || raw.isEmpty) return 0;
    return int.tryParse(raw) ?? 0;
  }

  Future<void> writeCursor(int cursor) async {
    await _storage.write(cursorStorageKey, '$cursor');
  }

  Future<void> clearCursor() async {
    await _storage.delete(cursorStorageKey);
  }

  Future<Map<String, dynamic>> pullAndDecrypt({int cursor = 0}) async {
    final pulled = await _api.pullBlobs(cursor: cursor);
    final blobs = (pulled['blobs'] as List<dynamic>? ?? []).cast<Map<String, dynamic>>();
    final mk = await masterKey();
    final decoded = <Map<String, dynamic>>[];
    for (final env in blobs) {
      if (env['deleted'] == true) {
        decoded.add({
          'collection': env['collection'],
          'record_id': env['record_id'],
          'payload': null,
          'deleted': true,
          'updated_at': env['updated_at'] as String?,
        });
        continue;
      }
      try {
        decoded.add(await _decryptEnvelope(env, mk));
      } catch (_) {
        throw SyncDecryptException();
      }
    }
    return {
      'records': decoded,
      'cursor': pulled['cursor'] ?? cursor,
      'has_more': pulled['has_more'] ?? false,
    };
  }

  /// Pull all pages, apply upserts/deletes, persist cursor.
  Future<SyncPullResult> pullUntilCaughtUp() async {
    var cursor = await readCursor();
    var applied = 0;
    var deleted = 0;
    while (true) {
      final page = await pullAndDecrypt(cursor: cursor);
      final records = (page['records'] as List).cast<Map<String, dynamic>>();
      for (final row in records) {
        final collection = row['collection'] as String;
        final recordId = row['record_id'] as String;
        if (row['deleted'] == true) {
          await _localStore.deleteRecord(collection: collection, recordId: recordId);
          deleted++;
          continue;
        }
        await _localStore.upsertRecord(
          collection: collection,
          recordId: recordId,
          payloadJson: jsonEncode(row['payload']),
          updatedAt: row['updated_at'] as String?,
        );
        applied++;
      }
      cursor = (page['cursor'] as num?)?.toInt() ?? cursor;
      await writeCursor(cursor);
      if (page['has_more'] != true) break;
    }
    return SyncPullResult(appliedCount: applied, deletedCount: deleted, cursor: cursor);
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
      'updated_at': env['updated_at'] as String?,
    };
  }
}
