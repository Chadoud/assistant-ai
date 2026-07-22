import 'dart:convert';
import 'dart:typed_data';

import 'package:exosites_mobile/sync/cloud_api.dart';
import 'package:exosites_mobile/sync/key_value_store.dart';
import 'package:exosites_mobile/sync/local_store.dart';
import 'package:exosites_mobile/sync/sync_crypto.dart';
import 'package:exosites_mobile/sync/sync_engine.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  test('pullUntilCaughtUp pages, upserts, deletes, persists cursor', () async {
    final master = Uint8List.fromList(List<int>.generate(32, (i) => i + 1));
    final storage = MemoryKeyValueStore();
    await storage.write('exosites_sync_master_key_b64', base64Encode(master));

    final store = LocalBrainStore(databasePath: ':memory:');
    await store.upsertRecord(
      collection: 'memory_entries',
      recordId: 'gone',
      payloadJson: '{"key":"old"}',
      updatedAt: '2025-01-01T00:00:00Z',
    );

    final rkey = await SyncCrypto.recordKey(master, 'memory_entries', 'keep');
    final env = await SyncCrypto.buildEnvelope(
      collection: 'memory_entries',
      recordId: 'keep',
      deviceId: 'desktop-1',
      logicalClock: SyncCrypto.logicalClock('2026-03-01T00:00:00Z', 'keep'),
      updatedAt: '2026-03-01T00:00:00Z',
      plaintext: Uint8List.fromList(utf8.encode('{"key":"kept"}')),
      recordKey: rkey,
    );

    var pullCalls = 0;
    final client = MockClient((request) async {
      expect(request.url.path, endsWith('/blobs/pull'));
      pullCalls++;
      if (pullCalls == 1) {
        return http.Response(
          jsonEncode({
            'blobs': [env],
            'cursor': 10,
            'has_more': true,
          }),
          200,
        );
      }
      return http.Response(
        jsonEncode({
          'blobs': [
            {
              'collection': 'memory_entries',
              'record_id': 'gone',
              'deleted': true,
              'updated_at': '2026-03-02T00:00:00Z',
            },
          ],
          'cursor': 20,
          'has_more': false,
        }),
        200,
      );
    });

    final api = CloudApi(
      baseUrl: 'https://example.test',
      accessToken: () => 'tok',
      httpClient: client,
    );
    final engine = SyncEngine(
      cloudUrl: 'https://example.test',
      accessToken: 'tok',
      deviceId: 'mobile-1',
      api: api,
      storage: storage,
      localStore: store,
    );

    final result = await engine.pullUntilCaughtUp();
    expect(result.appliedCount, 1);
    expect(result.deletedCount, 1);
    expect(result.cursor, 20);
    expect(await engine.readCursor(), 20);
    expect(pullCalls, 2);

    final rows = await store.listByCollection('memory_entries');
    expect(rows.length, 1);
    expect(rows.first['record_id'], 'keep');
    expect(rows.first['updated_at'], '2026-03-01T00:00:00Z');
  });
}
