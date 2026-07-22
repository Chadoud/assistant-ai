import 'package:exosites_mobile/sync/local_store.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  late LocalBrainStore store;

  setUp(() {
    store = LocalBrainStore(databasePath: ':memory:');
  });

  test('upsert, order by updated_at, delete, search', () async {
    await store.upsertRecord(
      collection: 'memory_entries',
      recordId: 'a',
      payloadJson: '{"key":"alpha","content":"hello world"}',
      updatedAt: '2026-01-01T00:00:00Z',
    );
    await store.upsertRecord(
      collection: 'memory_entries',
      recordId: 'b',
      payloadJson: '{"key":"beta","content":"other"}',
      updatedAt: '2026-02-01T00:00:00Z',
    );

    final listed = await store.listByCollection('memory_entries');
    expect(listed.first['record_id'], 'b');

    final hits = await store.search('hello');
    expect(hits.length, 1);
    expect(hits.first['record_id'], 'a');

    await store.deleteRecord(collection: 'memory_entries', recordId: 'a');
    expect(await store.countAll(), 1);

    await store.clearAll();
    expect(await store.countAll(), 0);
  });
}
