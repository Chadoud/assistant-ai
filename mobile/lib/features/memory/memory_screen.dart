import 'dart:convert';

import 'package:flutter/material.dart';

import '../../design/exo_colors.dart';
import '../../design/exo_spacing.dart';
import '../../design/exo_status_banner.dart';
import '../../design/exo_widgets.dart';
import '../../layout/window_size.dart';
import '../../sync/sync_banner_actions.dart';
import '../../sync/sync_errors.dart';
import '../../sync/user_messages.dart';
import '../settings/mobile_sync_config.dart';
import 'memory_list_tile.dart';

/// Memory tab — primary home after setup.
class MemoryScreen extends StatefulWidget {
  const MemoryScreen({
    super.key,
    required this.config,
    this.showAppBarBanner = true,
    this.onSignInAgain,
    this.onPairAgain,
  });

  final MobileSyncConfig config;
  final bool showAppBarBanner;
  final VoidCallback? onSignInAgain;
  final VoidCallback? onPairAgain;

  @override
  State<MemoryScreen> createState() => _MemoryScreenState();
}

class _MemoryScreenState extends State<MemoryScreen> {
  List<Map<String, dynamic>> _rows = [];
  int? _selectedIndex;
  int _seenEpoch = -1;
  bool _refreshing = false;
  String? _error;
  ExoStatusKind _errorKind = ExoStatusKind.error;

  @override
  void initState() {
    super.initState();
    widget.config.addListener(_onConfig);
    _load();
  }

  @override
  void dispose() {
    widget.config.removeListener(_onConfig);
    super.dispose();
  }

  void _onConfig() {
    if (widget.config.dataEpoch != _seenEpoch) {
      _load();
    }
  }

  Future<void> _load() async {
    _seenEpoch = widget.config.dataEpoch;
    final rows = await widget.config.localStore.listByCollection('memory_entries');
    if (mounted) {
      setState(() {
        _rows = rows;
        if (_selectedIndex != null && _selectedIndex! >= _rows.length) {
          _selectedIndex = null;
        }
      });
    }
  }

  Map<String, dynamic>? _payloadAt(int index) {
    if (index < 0 || index >= _rows.length) return null;
    return jsonDecode(_rows[index]['payload_json'] as String) as Map<String, dynamic>;
  }

  Future<void> _sync() async {
    if (_refreshing) return;
    setState(() {
      _refreshing = true;
      _error = null;
    });
    try {
      await widget.config.syncNow();
    } on SyncAuthException {
      setState(() {
        _error = SyncUserMessages.authExpired;
        _errorKind = ExoStatusKind.authExpired;
      });
    } on SyncNotPairedException {
      setState(() {
        _error = SyncUserMessages.notPaired;
        _errorKind = ExoStatusKind.needsPair;
      });
    } on SyncDecryptException {
      setState(() {
        _error = SyncUserMessages.decryptFailed;
        _errorKind = ExoStatusKind.decryptError;
      });
    } on SyncNetworkException {
      setState(() {
        _error = SyncUserMessages.networkFailed;
        _errorKind = ExoStatusKind.networkError;
      });
    } catch (_) {
      setState(() {
        _error = SyncUserMessages.syncFailed;
        _errorKind = ExoStatusKind.error;
      });
    } finally {
      if (mounted) setState(() => _refreshing = false);
    }
  }

  void _runBannerAction(SyncBannerAction action) {
    switch (action) {
      case SyncBannerAction.signIn:
        widget.onSignInAgain?.call();
      case SyncBannerAction.pair:
        widget.onPairAgain?.call();
      case SyncBannerAction.retry:
        _sync();
    }
  }

  void _openDetail(int index) {
    if (exoUseNavigationRail(context)) {
      setState(() => _selectedIndex = index);
      return;
    }
    final payload = _payloadAt(index);
    if (payload == null) return;
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => _MemoryDetailPage(payload: payload)),
    );
  }

  Widget _banner() {
    if (_refreshing) {
      return const ExoStatusBanner(
        kind: ExoStatusKind.syncing,
        message: SyncUserMessages.updatingFromDesktop,
        busy: true,
      );
    }
    if (_error != null) {
      final mapped = bannerActionFor(_errorKind);
      return ExoStatusBanner(
        kind: _errorKind,
        message: _error!,
        actionLabel: mapped?.$1,
        onAction: mapped == null ? null : () => _runBannerAction(mapped.$2),
      );
    }
    if (widget.config.lastSyncLabel != null) {
      return ExoStatusBanner(
        kind: ExoStatusKind.ready,
        message: SyncUserMessages.upToDate(widget.config.cachedRecordCount),
      );
    }
    return const SizedBox.shrink();
  }

  Widget _listTile(int i) {
    final payload = _payloadAt(i) ?? {};
    return Column(
      children: [
        if (i > 0) const Divider(height: 1),
        MemoryListTile(
          payload: payload,
          updatedAt: _rows[i]['updated_at'] as String?,
          selected: _selectedIndex == i,
          onTap: () => _openDetail(i),
        ),
      ],
    );
  }

  Widget _detailPane() {
    if (_selectedIndex == null || _selectedIndex! >= _rows.length) {
      return const ExoEmptyState(
        title: SyncUserMessages.selectMemoryTitle,
        subtitle: SyncUserMessages.selectMemorySubtitle,
        icon: Icons.notes_outlined,
      );
    }
    return _MemoryDetailBody(payload: _payloadAt(_selectedIndex!)!);
  }

  @override
  Widget build(BuildContext context) {
    final listBody = exoUseNavigationRail(context)
        ? Row(
            children: [
              Expanded(
                flex: 2,
                child: ListView.builder(
                  itemCount: _rows.length,
                  itemBuilder: (context, i) => _listTile(i),
                ),
              ),
              const VerticalDivider(width: 1),
              Expanded(flex: 3, child: _detailPane()),
            ],
          )
        : ListView.builder(
            itemCount: _rows.length,
            itemBuilder: (context, i) => _listTile(i),
          );

    return Column(
      children: [
        if (widget.showAppBarBanner)
          Padding(
            padding: const EdgeInsets.fromLTRB(ExoSpacing.lg, ExoSpacing.sm, ExoSpacing.lg, ExoSpacing.sm),
            child: _banner(),
          ),
        Expanded(
          child: RefreshIndicator(
            color: ExoColors.brandPrimary,
            backgroundColor: ExoColors.bgElevated,
            onRefresh: _sync,
            child: _rows.isEmpty
                ? ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: const [
                      SizedBox(height: 80),
                      ExoEmptyState(
                        title: SyncUserMessages.memoryEmptyTitle,
                        subtitle: SyncUserMessages.memoryEmptySubtitle,
                        icon: Icons.psychology_outlined,
                      ),
                    ],
                  )
                : listBody,
          ),
        ),
      ],
    );
  }
}

class _MemoryDetailPage extends StatelessWidget {
  const _MemoryDetailPage({required this.payload});

  final Map<String, dynamic> payload;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(MemoryListTile.titleOf(payload))),
      body: _MemoryDetailBody(payload: payload),
    );
  }
}

class _MemoryDetailBody extends StatelessWidget {
  const _MemoryDetailBody({required this.payload});

  final Map<String, dynamic> payload;

  @override
  Widget build(BuildContext context) {
    final category = payload['category']?.toString().trim();
    return SingleChildScrollView(
      padding: const EdgeInsets.all(ExoSpacing.lg),
      child: ExoContentWidth(
        child: ExoSurface(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                MemoryListTile.titleOf(payload),
                style: Theme.of(context).textTheme.titleLarge,
              ),
              if (category != null && category.isNotEmpty) ...[
                const SizedBox(height: ExoSpacing.sm),
                Text(category, style: Theme.of(context).textTheme.bodySmall),
              ],
              const SizedBox(height: ExoSpacing.lg),
              const Divider(height: 1),
              const SizedBox(height: ExoSpacing.lg),
              Text(
                '${payload['content'] ?? payload['description'] ?? ''}',
                style: Theme.of(context).textTheme.bodyLarge,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
