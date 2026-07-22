import 'package:exosites_mobile/features/memory/memory_list_tile.dart';
import 'package:exosites_mobile/sync/user_messages.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('titleOf falls back through key content description', () {
    expect(MemoryListTile.titleOf({'key': 'Alpha'}), 'Alpha');
    expect(MemoryListTile.titleOf({'content': 'Hello world'}), 'Hello world');
    expect(MemoryListTile.titleOf({}), SyncUserMessages.memoryFallbackTitle);
  });

  test('relativeTime formats recent timestamps', () {
    final iso = DateTime.now().toUtc().subtract(const Duration(hours: 2)).toIso8601String();
    expect(MemoryListTile.relativeTime(iso), '2h ago');
    expect(MemoryListTile.relativeTime(null), isNull);
  });
}
