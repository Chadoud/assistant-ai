import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart' as p;

/// Lightweight SQLite cache for pulled GO SYNC records (memory + tasks v1).
class LocalBrainStore {
  Database? _db;

  Future<Database> get db async {
    if (_db != null) return _db!;
    final path = p.join(await getDatabasesPath(), 'exosites_brain.db');
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
