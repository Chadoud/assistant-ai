import 'dart:convert';

import 'package:flutter/material.dart';

import '../../design/exo_colors.dart';
import '../../design/exo_spacing.dart';
import '../../design/exo_widgets.dart';
import '../../layout/window_size.dart';
import '../../sync/local_store.dart';
import '../settings/mobile_sync_config.dart';

/// Memory tab — cached entries with adaptive list / master-detail on tablet.
class MemoryScreen extends StatefulWidget {
  const MemoryScreen({super.key, required this.config});

  final MobileSyncConfig config;

  @override
  State<MemoryScreen> createState() => _MemoryScreenState();
}

class _MemoryScreenState extends State<MemoryScreen> {
  final _store = LocalBrainStore();
  List<Map<String, dynamic>> _rows = [];
  int? _selectedIndex;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final rows = await _store.listByCollection('memory_entries');
    if (mounted) setState(() => _rows = rows);
  }

  Map<String, dynamic>? _payloadAt(int index) {
    if (index < 0 || index >= _rows.length) return null;
    return jsonDecode(_rows[index]['payload_json'] as String) as Map<String, dynamic>;
  }

  Widget _listTile(int i) {
    final payload = _payloadAt(i);
    final title = payload?['key'] ?? payload?['content'] ?? 'Memory';
    final subtitle = '${payload?['category'] ?? ''}';
    return ListTile(
      selected: _selectedIndex == i,
      title: Text('$title', maxLines: 2, overflow: TextOverflow.ellipsis),
      subtitle: Text(subtitle),
      onTap: () => setState(() => _selectedIndex = i),
    );
  }

  Widget _detailPane() {
    if (_selectedIndex == null || _selectedIndex! >= _rows.length) {
      return const ExoEmptyState(
        title: 'Select a memory',
        subtitle: 'Choose an item from the list to read it here.',
      );
    }
    final payload = _payloadAt(_selectedIndex!)!;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(ExoSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('${payload['key'] ?? 'Memory'}', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: ExoSpacing.sm),
          Text('${payload['content'] ?? payload['description'] ?? ''}',
              style: Theme.of(context).textTheme.bodyLarge),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_rows.isEmpty) {
      return const ExoEmptyState(
        title: 'No memories yet',
        subtitle: 'Open Today and tap Sync now after pairing with desktop.',
      );
    }

    if (exoUseNavigationRail(context)) {
      return Row(
        children: [
          Expanded(
            flex: 2,
            child: ListView.builder(
              itemCount: _rows.length,
              itemBuilder: (context, i) => _listTile(i),
            ),
          ),
          VerticalDivider(width: 1, color: ExoColors.border.withValues(alpha: 0.4)),
          Expanded(flex: 3, child: _detailPane()),
        ],
      );
    }

    return ListView.builder(
      itemCount: _rows.length,
      itemBuilder: (context, i) => _listTile(i),
    );
  }
}
