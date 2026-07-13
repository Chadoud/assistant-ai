import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:cryptography/cryptography.dart';

/// GO SYNC crypto — ChaCha20-Poly1305 record encryption (matches Python client).
class SyncCrypto {
  static const int keyLength = 32;
  static const int nonceLength = 12;

  static final _chacha = Chacha20.poly1305Aead();
  static final _rng = Random.secure();

  /// Stable 32-byte key per (collection, record_id) derived from master key.
  static Future<SecretKey> recordKey(Uint8List masterKey, String collection, String recordId) async {
    final h = await Sha256().hash(
      Uint8List.fromList([...masterKey, ...utf8.encode(collection), ...utf8.encode(recordId)]),
    );
    return SecretKey(h.bytes);
  }

  static Future<String> encryptRecord(Uint8List plaintext, SecretKey recordKey) async {
    final nonce = _randomNonce();
    final box = await _chacha.encrypt(plaintext, secretKey: recordKey, nonce: nonce);
    final combined = Uint8List.fromList([...nonce, ...box.cipherText, ...box.mac.bytes]);
    return base64Encode(combined);
  }

  static Future<Uint8List> decryptRecord(String ciphertextB64, SecretKey recordKey) async {
    final raw = base64Decode(ciphertextB64);
    if (raw.length < nonceLength + 16) {
      throw ArgumentError('ciphertext too short');
    }
    final nonce = raw.sublist(0, nonceLength);
    final rest = raw.sublist(nonceLength);
    const macLen = 16;
    final cipherText = rest.sublist(0, rest.length - macLen);
    final mac = Mac(rest.sublist(rest.length - macLen));
    final box = SecretBox(cipherText, nonce: nonce, mac: mac);
    return Uint8List.fromList(await _chacha.decrypt(box, secretKey: recordKey));
  }

  static String contentHash(Uint8List plaintext) {
    final digest = sha256.convert(plaintext);
    return digest.bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  }

  /// Matches Python `backend/sync_engine.py` logical clock (seconds × 1000 + tail).
  static int logicalClock(String updatedAt, String recordId) {
    final dt = DateTime.tryParse(updatedAt);
    final baseSec = dt != null ? dt.millisecondsSinceEpoch ~/ 1000 : 0;
    final hex = sha256.convert(utf8.encode(recordId)).toString();
    final tail = int.parse(hex.substring(0, 8), radix: 16) % 1000;
    return baseSec * 1000 + tail;
  }

  static Future<Map<String, dynamic>> buildEnvelope({
    required String collection,
    required String recordId,
    required String deviceId,
    required int logicalClock,
    required String updatedAt,
    required Uint8List plaintext,
    required SecretKey recordKey,
    bool deleted = false,
    int schemaVersion = 1,
  }) async {
    return {
      'schema_version': schemaVersion,
      'collection': collection,
      'record_id': recordId,
      'device_id': deviceId,
      'logical_clock': logicalClock,
      'updated_at': updatedAt,
      'deleted': deleted,
      'ciphertext': await encryptRecord(plaintext, recordKey),
      'content_hash': contentHash(plaintext),
    };
  }

  static List<int> _randomNonce() {
    return List<int>.generate(nonceLength, (_) => _rng.nextInt(256));
  }
}
