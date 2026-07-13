import 'package:flutter/material.dart';

import 'app/exo_config.dart';
import 'design/exo_theme.dart';
import 'features/auth/mobile_auth_service.dart';
import 'features/settings/mobile_sync_config.dart';
import 'layout/adaptive_shell.dart';
import 'telemetry/mobile_crash_reporter.dart';

final _crashReporter = MobileCrashReporter();

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ExositesMobileApp());
}

/// Flutter mobile — GO SYNC client with adaptive Exo shell.
class ExositesMobileApp extends StatefulWidget {
  const ExositesMobileApp({super.key});

  @override
  State<ExositesMobileApp> createState() => _ExositesMobileAppState();
}

class _ExositesMobileAppState extends State<ExositesMobileApp> {
  final _config = MobileSyncConfig();
  late final MobileAuthService _auth = MobileAuthService(config: _config);

  @override
  void initState() {
    super.initState();
    _config.hydrate().then((_) {
      _crashReporter.install(optIn: _config.crashReportsOptIn);
    });
    _config.addListener(_onConfigChanged);
    _auth.startListening();
  }

  @override
  void dispose() {
    _config.removeListener(_onConfigChanged);
    super.dispose();
  }

  void _onConfigChanged() {
    _crashReporter.setOptIn(_config.crashReportsOptIn);
  }

  @override
  Widget build(BuildContext context) {
    final title = ExoConfig.displayFlavor.isEmpty ? 'Exo' : 'Exo (${ExoConfig.displayFlavor})';
    return MaterialApp(
      title: title,
      theme: ExoTheme.dark(),
      home: ListenableBuilder(
        listenable: _config,
        builder: (context, _) => AdaptiveShell(config: _config),
      ),
    );
  }
}
