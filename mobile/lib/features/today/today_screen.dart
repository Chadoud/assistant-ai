import 'dart:convert';

import 'package:flutter/material.dart';

import '../../design/exo_spacing.dart';
import '../../design/exo_widgets.dart';
import '../settings/mobile_sync_config.dart';

/// Today tab — sync status and pull action.
class TodayScreen extends StatefulWidget {
  const TodayScreen({super.key, required this.config});

  final MobileSyncConfig config;

  @override
  State<TodayScreen> createState() => _TodayScreenState();
}

class _TodayScreenState extends State<TodayScreen> {
  String _status = 'Pull from GO SYNC to see tasks and digests.';
  bool _busy = false;

  Future<void> _sync() async {
    if (!widget.config.isConfigured) {
      setState(() => _status = 'Sign in and pair with desktop in Settings.');
      return;
    }
    setState(() => _busy = true);
    try {
      final engine = widget.config.engine;
      final store = engine.localStore;
      final result = await engine.pullAndDecrypt();
      var count = 0;
      for (final row in result['records'] as List<Map<String, dynamic>>) {
        if (row['deleted'] == true) continue;
        await store.upsertRecord(
          collection: row['collection'] as String,
          recordId: row['record_id'] as String,
          payloadJson: jsonEncode(row['payload']),
        );
        count++;
      }
      final tasks = await store.listByCollection('tasks', limit: 5);
      setState(() {
        _status = tasks.isEmpty
            ? 'Synced $count records — no tasks yet.'
            : '${tasks.length} recent tasks loaded.';
      });
    } catch (e) {
      setState(() => _status = 'Sync failed — check your connection and try again.');
    } finally {
      setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(ExoSpacing.lg),
      child: ExoContentWidth(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ExoSyncStatusBanner(message: _status, isError: _status.startsWith('Sync failed')),
            const SizedBox(height: ExoSpacing.lg),
            ExoPrimaryButton(
              label: 'Sync now',
              busy: _busy,
              onPressed: _sync,
            ),
          ],
        ),
      ),
    );
  }
}
