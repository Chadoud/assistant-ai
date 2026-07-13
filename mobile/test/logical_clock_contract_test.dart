import 'dart:convert';
import 'dart:io';

import 'package:exosites_mobile/sync/sync_crypto.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('logicalClock matches Python golden fixture', () {
    final fixtureFile = File('../sync/tests/fixtures/logical_clock.json');
    expect(fixtureFile.existsSync(), isTrue, reason: 'sync fixture missing');
    final data = jsonDecode(fixtureFile.readAsStringSync()) as Map<String, dynamic>;
    for (final caseObj in data['cases'] as List<dynamic>) {
      final map = caseObj as Map<String, dynamic>;
      final clock = SyncCrypto.logicalClock(
        map['updated_at'] as String,
        map['record_id'] as String,
      );
      expect(clock, map['expected_clock'], reason: map['record_id'] as String?);
    }
  });
}
