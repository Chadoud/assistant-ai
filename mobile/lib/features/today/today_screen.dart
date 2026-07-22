import 'dart:convert';

import 'package:flutter/material.dart';

import '../../design/exo_colors.dart';
import '../../design/exo_spacing.dart';
import '../../design/exo_status_banner.dart';
import '../../design/exo_widgets.dart';
import '../../sync/sync_banner_actions.dart';
import '../../sync/sync_errors.dart';
import '../../sync/user_messages.dart';
import '../memory/memory_list_tile.dart';
import '../../app/mobile_sync_config.dart';

/// Today tab — status + recent memories.
class TodayScreen extends StatefulWidget {
  const TodayScreen({
    super.key,
    required this.config,
    this.onSignInAgain,
    this.onPairAgain,
  });

  final MobileSyncConfig config;
  final VoidCallback? onSignInAgain;
  final VoidCallback? onPairAgain;

  @override
  State<TodayScreen> createState() => _TodayScreenState();
}

class _TodayScreenState extends State<TodayScreen> {
  bool _busy = false;
  String? _error;
  ExoStatusKind _errorKind = ExoStatusKind.error;
  List<Map<String, dynamic>> _recent = [];

  @override
  void initState() {
    super.initState();
    widget.config.addListener(_onConfig);
    _loadRecent();
  }

  @override
  void dispose() {
    widget.config.removeListener(_onConfig);
    super.dispose();
  }

  void _onConfig() {
    _loadRecent();
    if (mounted) setState(() {});
  }

  Future<void> _loadRecent() async {
    final rows = await widget.config.localStore.listByCollection('memory_entries', limit: 3);
    if (mounted) setState(() => _recent = rows);
  }

  Future<void> _sync() async {
    setState(() {
      _busy = true;
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
      if (mounted) setState(() => _busy = false);
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

  Widget _banner() {
    if (_busy) {
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
    return ExoStatusBanner(
      kind: ExoStatusKind.ready,
      message: SyncUserMessages.upToDate(widget.config.cachedRecordCount),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(ExoSpacing.lg),
      child: ExoContentWidth(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ExoSurface(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Today', style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: ExoSpacing.xs),
                  Text(
                    widget.config.lastSyncLabel == null
                        ? 'Pull updates from your desktop when you\'re ready.'
                        : 'Last update · ${widget.config.lastSyncLabel}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(height: ExoSpacing.lg),
                  const Divider(height: 1),
                  const SizedBox(height: ExoSpacing.lg),
                  _banner(),
                  const SizedBox(height: ExoSpacing.md),
                  ExoPrimaryButton(
                    label: SyncUserMessages.syncNow,
                    busy: _busy,
                    onPressed: _busy ? null : _sync,
                  ),
                ],
              ),
            ),
            if (_recent.isNotEmpty) ...[
              const SizedBox(height: ExoSpacing.xl),
              const ExoSectionLabel('Recent'),
              const SizedBox(height: ExoSpacing.sm),
              ExoSurface(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    for (var i = 0; i < _recent.length; i++) ...[
                      if (i > 0) const Divider(height: 1),
                      MemoryListTile(
                        payload: jsonDecode(_recent[i]['payload_json'] as String)
                            as Map<String, dynamic>,
                        updatedAt: _recent[i]['updated_at'] as String?,
                      ),
                    ],
                  ],
                ),
              ),
            ] else ...[
              const SizedBox(height: ExoSpacing.xl),
              ExoEmptyState(
                title: SyncUserMessages.memoryEmptyTitle,
                subtitle: SyncUserMessages.memoryEmptySubtitle,
                icon: Icons.psychology_outlined,
                actionLabel: SyncUserMessages.syncNow,
                onAction: _busy ? null : _sync,
              ),
            ],
            const SizedBox(height: ExoSpacing.lg),
            Text(
              '${widget.config.cachedRecordCount} on this phone',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: ExoColors.textMuted),
            ),
          ],
        ),
      ),
    );
  }
}
