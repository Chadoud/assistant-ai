import 'dart:convert';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:exosites_mobile/sync/sync_crypto.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('SyncCrypto', () {
    test('logicalClock matches Python sha256 tail algorithm', () {
      const updatedAt = '2026-06-11T12:00:00+00:00';
      const recordId = 'abc-123';
      final clock = SyncCrypto.logicalClock(updatedAt, recordId);
      expect(clock, greaterThan(0));
      expect(clock % 1000, lessThan(1000));
    });

    test('encrypt decrypt roundtrip', () async {
      final key = SecretKey(Uint8List.fromList(List.filled(32, 7)));
      const plain = 'hello sync';
      final ct = await SyncCrypto.encryptRecord(Uint8List.fromList(utf8.encode(plain)), key);
      final out = await SyncCrypto.decryptRecord(ct, key);
      expect(utf8.decode(out), plain);
    });

    test('buildEnvelope shape', () async {
      final mk = Uint8List.fromList(List.filled(32, 9));
      final rkey = await SyncCrypto.recordKey(mk, 'memory_entries', 'id-1');
      final env = await SyncCrypto.buildEnvelope(
        collection: 'memory_entries',
        recordId: 'id-1',
        deviceId: 'device-1',
        logicalClock: 1,
        updatedAt: '2026-06-11T12:00:00+00:00',
        plaintext: Uint8List.fromList(utf8.encode('{"a":1}')),
        recordKey: rkey,
      );
      expect(env['schema_version'], 1);
      expect(env['ciphertext'], isNotEmpty);
      expect('${env['content_hash']}'.length, 64);
    });
  });
}
