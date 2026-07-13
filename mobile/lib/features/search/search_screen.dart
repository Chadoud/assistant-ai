import 'dart:convert';

import 'package:flutter/material.dart';

import '../../design/exo_spacing.dart';
import '../../design/exo_widgets.dart';
import '../../sync/local_store.dart';

/// Search tab — local cache full-text search.
class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final _controller = TextEditingController();
  final _store = LocalBrainStore();
  List<Map<String, dynamic>> _hits = [];

  Future<void> _search() async {
    final q = _controller.text.trim();
    if (q.length < 2) return;
    final hits = await _store.search(q);
    setState(() => _hits = hits);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(ExoSpacing.sm),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _controller,
                  decoration: const InputDecoration(hintText: 'Search your brain…'),
                  onSubmitted: (_) => _search(),
                ),
              ),
              IconButton(
                onPressed: _search,
                icon: const Icon(Icons.search),
                tooltip: 'Search',
              ),
            ],
          ),
        ),
        Expanded(
          child: _hits.isEmpty
              ? const ExoEmptyState(
                  title: 'Search your memories',
                  subtitle: 'Type at least two characters, then tap search.',
                )
              : ListView.builder(
                  itemCount: _hits.length,
                  itemBuilder: (context, i) {
                    final payload = jsonDecode(_hits[i]['payload_json'] as String);
                    return ListTile(
                      title: Text('${payload['key'] ?? payload['description'] ?? 'Hit'}'),
                      subtitle: Text('${_hits[i]['collection']}'),
                    );
                  },
                ),
        ),
      ],
    );
  }
}
