import 'package:flutter/material.dart';

import '../features/capture/capture_screen.dart';
import '../features/memory/memory_screen.dart';
import '../features/search/search_screen.dart';
import '../features/settings/mobile_sync_config.dart';
import '../features/settings/settings_screen.dart';
import '../features/today/today_screen.dart';
import 'window_size.dart';

/// Adaptive navigation: bottom bar on phones, rail on tablet / wide layouts.
class AdaptiveShell extends StatefulWidget {
  const AdaptiveShell({super.key, required this.config});

  final MobileSyncConfig config;

  @override
  State<AdaptiveShell> createState() => _AdaptiveShellState();
}

class _AdaptiveShellState extends State<AdaptiveShell> {
  int _tab = 0;

  static const _labels = ['Today', 'Memory', 'Capture', 'Search'];
  static const _icons = [Icons.today, Icons.psychology, Icons.mic, Icons.search];

  void _openSettings() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => SettingsScreen(config: widget.config)),
    );
  }

  Widget _bodyForTab(int index) {
    switch (index) {
      case 0:
        return TodayScreen(config: widget.config);
      case 1:
        return MemoryScreen(config: widget.config);
      case 2:
        return const CaptureScreen();
      case 3:
        return const SearchScreen();
      default:
        return const SizedBox.shrink();
    }
  }

  @override
  Widget build(BuildContext context) {
    final useRail = exoUseNavigationRail(context);
    final body = _bodyForTab(_tab);

    if (useRail) {
      return Scaffold(
        appBar: AppBar(
          title: Text(_labels[_tab]),
          actions: [
            IconButton(icon: const Icon(Icons.settings), onPressed: _openSettings),
          ],
        ),
        body: Row(
          children: [
            NavigationRail(
              selectedIndex: _tab,
              onDestinationSelected: (i) => setState(() => _tab = i),
              destinations: [
                for (var i = 0; i < _labels.length; i++)
                  NavigationRailDestination(
                    icon: Icon(_icons[i]),
                    label: Text(_labels[i]),
                  ),
              ],
            ),
            const VerticalDivider(width: 1),
            Expanded(child: body),
          ],
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(_labels[_tab]),
        actions: [
          IconButton(icon: const Icon(Icons.settings), onPressed: _openSettings),
        ],
      ),
      body: body,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: [
          for (var i = 0; i < _labels.length; i++)
            NavigationDestination(icon: Icon(_icons[i]), label: _labels[i]),
        ],
      ),
    );
  }
}
