import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

/// Lightweight SQLite cache for pulled GO SYNC records (memory + tasks v1).
class LocalBrainStore {
  LocalBrainStore({String? databasePath}) : _databasePath = databasePath;

  final String? _databasePath;
  Database? _db;

  static const dbFileName = 'exosites_brain.db';

  Future<String> _resolvePath() async {
    final override = _databasePath;
    if (override != null) return override;
    return p.join(await getDatabasesPath(), dbFileName);
  }

  Future<Database> get db async {
    if (_db != null) return _db!;
    final path = await _resolvePath();
    _db = await openDatabase(
      path,
      version: 1,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE synced_records (
            collection TEXT NOT NULL,
            record_id TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            updated_at TEXT,
            PRIMARY KEY (collection, record_id)
          )
        ''');
      },
    );
    return _db!;
  }

  Future<void> upsertRecord({
    required String collection,
    required String recordId,
    required String payloadJson,
    String? updatedAt,
  }) async {
    final database = await db;
    await database.insert(
      'synced_records',
      {
        'collection': collection,
        'record_id': recordId,
        'payload_json': payloadJson,
        'updated_at': updatedAt,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<void> deleteRecord({
    required String collection,
    required String recordId,
  }) async {
    final database = await db;
    await database.delete(
      'synced_records',
      where: 'collection = ? AND record_id = ?',
      whereArgs: [collection, recordId],
    );
  }

  Future<void> clearAll() async {
    final database = await db;
    await database.delete('synced_records');
  }

  /// Close and delete the on-disk database (full device forget).
  Future<void> wipeDatabase() async {
    final path = await _resolvePath();
    if (_db != null) {
      await _db!.close();
      _db = null;
    }
    await deleteDatabase(path);
  }

  Future<int> countAll() async {
    final database = await db;
    final rows = await database.rawQuery('SELECT COUNT(*) AS c FROM synced_records');
    return (rows.first['c'] as int?) ?? 0;
  }

  Future<List<Map<String, dynamic>>> listByCollection(String collection, {int limit = 100}) async {
    final database = await db;
    return database.query(
      'synced_records',
      where: 'collection = ?',
      whereArgs: [collection],
      orderBy: 'updated_at DESC',
      limit: limit,
    );
  }

  Future<List<Map<String, dynamic>>> search(String query, {int limit = 50}) async {
    final database = await db;
    return database.query(
      'synced_records',
      where: 'payload_json LIKE ?',
      whereArgs: ['%$query%'],
      limit: limit,
    );
  }
}
