import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../design/exo_colors.dart';
import '../features/auth/mobile_auth_service.dart';
import '../features/memory/memory_screen.dart';
import '../features/search/search_screen.dart';
import '../app/mobile_sync_config.dart';
import '../features/settings/pairing_screen.dart';
import '../features/settings/settings_screen.dart';
import '../features/today/today_screen.dart';
import '../sync/sync_errors.dart';
import '../sync/user_messages.dart';
import 'window_size.dart';

/// Adaptive navigation: 3 tabs — Today, Memory (default), Search.
class AdaptiveShell extends StatefulWidget {
  const AdaptiveShell({
    super.key,
    required this.config,
    this.auth,
    this.initialTab = 1,
  });

  final MobileSyncConfig config;
  final MobileAuthService? auth;

  /// Default Memory (index 1). Capture is never a tab.
  final int initialTab;

  /// Tab labels for tests / docs — Capture must not appear.
  static const tabLabels = ['Today', 'Memory', 'Search'];

  @override
  State<AdaptiveShell> createState() => _AdaptiveShellState();
}

class _AdaptiveShellState extends State<AdaptiveShell> {
  late int _tab = widget.initialTab;
  bool _syncing = false;

  static const _icons = [
    Icons.wb_sunny_outlined,
    Icons.psychology_outlined,
    Icons.search,
  ];
  static const _selectedIcons = [
    Icons.wb_sunny,
    Icons.psychology,
    Icons.search,
  ];

  void _openSettings() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => SettingsScreen(config: widget.config, auth: widget.auth),
      ),
    );
  }

  Future<void> _signInAgain() async {
    final auth = widget.auth;
    if (auth == null) return;
    try {
      await launchUrl(auth.googleSignInUri(), mode: LaunchMode.externalApplication);
    } catch (_) {
      _snack(SyncUserMessages.signInFailed);
    }
  }

  Future<void> _pairAgain() async {
    final paired = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => PairingScreen(config: widget.config)),
    );
    if (paired == true && mounted) {
      try {
        await widget.config.registerDeviceIfNeeded();
      } catch (_) {}
      setState(() {});
    }
  }

  Future<void> _sync() async {
    if (_syncing) return;
    setState(() => _syncing = true);
    try {
      await widget.config.syncNow();
    } on SyncAuthException {
      _snack(SyncUserMessages.authExpired);
    } on SyncNetworkException {
      _snack(SyncUserMessages.networkFailed);
    } catch (_) {
      _snack(SyncUserMessages.syncFailed);
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Widget _bodyForTab(int index) {
    switch (index) {
      case 0:
        return TodayScreen(
          config: widget.config,
          onSignInAgain: _signInAgain,
          onPairAgain: _pairAgain,
        );
      case 1:
        return MemoryScreen(
          config: widget.config,
          onSignInAgain: _signInAgain,
          onPairAgain: _pairAgain,
        );
      case 2:
        return SearchScreen(config: widget.config);
      default:
        return const SizedBox.shrink();
    }
  }

  List<Widget> _actions() {
    return [
      IconButton(
        icon: _syncing
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Icon(Icons.sync, size: 22),
        onPressed: _syncing ? null : _sync,
        tooltip: SyncUserMessages.syncNow,
      ),
      IconButton(
        icon: const Icon(Icons.settings_outlined, size: 22),
        onPressed: _openSettings,
        tooltip: 'Settings',
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final useRail = exoUseNavigationRail(context);
    const labels = AdaptiveShell.tabLabels;
    final title = _tab == 1 ? SyncUserMessages.memoriesTitle : labels[_tab];
    final body = _bodyForTab(_tab);

    if (useRail) {
      return Scaffold(
        appBar: AppBar(
          title: Text(title),
          actions: _actions(),
          bottom: const PreferredSize(
            preferredSize: Size.fromHeight(1),
            child: Divider(height: 1),
          ),
        ),
        body: Row(
          children: [
            NavigationRail(
              selectedIndex: _tab,
              onDestinationSelected: (i) => setState(() => _tab = i),
              destinations: [
                for (var i = 0; i < labels.length; i++)
                  NavigationRailDestination(
                    icon: Icon(_icons[i]),
                    selectedIcon: Icon(_selectedIcons[i]),
                    label: Text(labels[i]),
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
        title: Text(title),
        actions: _actions(),
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(height: 1),
        ),
      ),
      body: body,
      bottomNavigationBar: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Divider(height: 1),
          NavigationBar(
            selectedIndex: _tab,
            onDestinationSelected: (i) => setState(() => _tab = i),
            destinations: [
              for (var i = 0; i < labels.length; i++)
                NavigationDestination(
                  icon: Icon(_icons[i]),
                  selectedIcon: Icon(_selectedIcons[i], color: ExoColors.brandPrimary),
                  label: labels[i],
                ),
            ],
          ),
        ],
      ),
    );
  }
}
