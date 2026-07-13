import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/exo_config.dart';
import '../../telemetry/mobile_crash_reporter.dart';
import '../../design/exo_spacing.dart';
import '../../design/exo_widgets.dart';
import '../auth/mobile_auth_service.dart';
import 'mobile_sync_config.dart';
import 'pairing_screen.dart';

/// GO SYNC settings — sign in, pair with desktop, session status.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key, required this.config});

  final MobileSyncConfig config;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _busy = false;
  late final MobileAuthService _auth = MobileAuthService(config: widget.config);

  Future<void> _signIn() async {
    setState(() => _busy = true);
    try {
      final uri = _auth.googleSignInUri();
      if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
        throw Exception('Could not open sign-in');
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not open sign-in. Check your cloud URL.')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pair() async {
    final paired = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => PairingScreen(config: widget.config)),
    );
    if (paired == true && mounted) {
      await widget.config.registerDeviceIfNeeded();
      setState(() {});
    }
  }

  @override
  Widget build(BuildContext context) {
    final cfg = widget.config;
    return Scaffold(
      appBar: AppBar(
        title: Text(ExoConfig.displayFlavor.isEmpty ? 'Settings' : 'Settings (${ExoConfig.displayFlavor})'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(ExoSpacing.lg),
        child: ExoContentWidth(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ExoCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Account', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: ExoSpacing.sm),
                    Text(
                      cfg.accessTokenSync.isEmpty
                          ? 'Not signed in'
                          : 'Signed in — cloud relay configured',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: ExoSpacing.lg),
                    ExoPrimaryButton(label: 'Sign in with Google', busy: _busy, onPressed: _signIn),
                  ],
                ),
              ),
              const SizedBox(height: ExoSpacing.lg),
              ExoCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('GO SYNC', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: ExoSpacing.sm),
                    ExoSyncStatusBanner(
                      message: cfg.isPaired
                          ? 'Paired with desktop — your memories can sync.'
                          : 'Pair with desktop to decrypt synced data.',
                      isError: !cfg.isPaired,
                    ),
                    const SizedBox(height: ExoSpacing.lg),
                    ExoPrimaryButton(
                      label: cfg.isPaired ? 'Re-pair device' : 'Pair with desktop',
                      onPressed: _pair,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: ExoSpacing.lg),
              ExoCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Privacy', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: ExoSpacing.sm),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Send crash reports'),
                      subtitle: Text(
                        MobileCrashReporter.isBuildConfigured
                            ? 'Help fix bugs by sending anonymous crash data when the app fails.'
                            : 'Crash reporting is not configured in this build.',
                      ),
                      value: cfg.crashReportsOptIn,
                      onChanged: MobileCrashReporter.isBuildConfigured
                          ? (v) async {
                              await cfg.setCrashReportsOptIn(v);
                              if (mounted) setState(() {});
                            }
                          : null,
                    ),
                    const SizedBox(height: ExoSpacing.sm),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Privacy policy'),
                      trailing: const Icon(Icons.open_in_new, size: 18),
                      onTap: () => launchUrl(
                        Uri.parse(ExoConfig.privacyPolicyUrl),
                        mode: LaunchMode.externalApplication,
                      ),
                    ),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Terms of service'),
                      trailing: const Icon(Icons.open_in_new, size: 18),
                      onTap: () => launchUrl(
                        Uri.parse(ExoConfig.termsOfServiceUrl),
                        mode: LaunchMode.externalApplication,
                      ),
                    ),
                  ],
                ),
              ),
              if (cfg.accessTokenSync.isNotEmpty) ...[
                const SizedBox(height: ExoSpacing.lg),
                TextButton(
                  onPressed: () async {
                    await cfg.clearSession();
                    if (mounted) setState(() {});
                  },
                  child: const Text('Sign out'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
