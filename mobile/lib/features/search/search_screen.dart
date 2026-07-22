import 'dart:convert';

import 'package:flutter/material.dart';

import '../../design/exo_colors.dart';
import '../../design/exo_spacing.dart';
import '../../design/exo_widgets.dart';
import '../memory/memory_list_tile.dart';
import '../../app/mobile_sync_config.dart';

/// Search tab — local cache full-text search.
class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key, required this.config});

  final MobileSyncConfig config;

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final _controller = TextEditingController();
  List<Map<String, dynamic>> _hits = [];
  int _seenEpoch = -1;
  bool _searched = false;

  @override
  void initState() {
    super.initState();
    widget.config.addListener(_onConfig);
  }

  @override
  void dispose() {
    widget.config.removeListener(_onConfig);
    _controller.dispose();
    super.dispose();
  }

  void _onConfig() {
    if (widget.config.dataEpoch != _seenEpoch && _controller.text.trim().length >= 2) {
      _search();
    }
  }

  Future<void> _search() async {
    final q = _controller.text.trim();
    if (q.length < 2) {
      setState(() {
        _hits = [];
        _searched = false;
      });
      return;
    }
    _seenEpoch = widget.config.dataEpoch;
    final hits = await widget.config.localStore.search(q);
    if (mounted) {
      setState(() {
        _hits = hits;
        _searched = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(ExoSpacing.lg, ExoSpacing.md, ExoSpacing.lg, ExoSpacing.sm),
          child: TextField(
            controller: _controller,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: 'Search memories',
              prefixIcon: const Icon(Icons.search, size: 20),
              suffixIcon: _controller.text.isEmpty
                  ? null
                  : IconButton(
                      icon: const Icon(Icons.close, size: 18),
                      onPressed: () {
                        _controller.clear();
                        setState(() {
                          _hits = [];
                          _searched = false;
                        });
                      },
                    ),
            ),
            onChanged: (_) => setState(() {}),
            onSubmitted: (_) => _search(),
          ),
        ),
        Expanded(
          child: !_searched
              ? const ExoEmptyState(
                  title: 'Search your memories',
                  subtitle: 'Type at least two characters, then search.',
                  icon: Icons.search,
                )
              : _hits.isEmpty
                  ? ExoEmptyState(
                      title: 'No matches',
                      subtitle: 'Nothing matched “${_controller.text.trim()}”.',
                      icon: Icons.search_off_outlined,
                    )
                  : ListView.builder(
                      itemCount: _hits.length,
                      itemBuilder: (context, i) {
                        final payload = jsonDecode(_hits[i]['payload_json'] as String)
                            as Map<String, dynamic>;
                        return Column(
                          children: [
                            if (i > 0) const Divider(height: 1),
                            MemoryListTile(
                              payload: payload,
                              updatedAt: _hits[i]['updated_at'] as String?,
                            ),
                            Padding(
                              padding: const EdgeInsets.fromLTRB(
                                ExoSpacing.lg,
                                0,
                                ExoSpacing.lg,
                                ExoSpacing.sm,
                              ),
                              child: Align(
                                alignment: Alignment.centerLeft,
                                child: Text(
                                  '${_hits[i]['collection']}',
                                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                        color: ExoColors.textMuted,
                                      ),
                                ),
                              ),
                            ),
                          ],
                        );
                      },
                    ),
        ),
      ],
    );
  }
}
