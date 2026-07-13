import 'package:flutter/material.dart';

import '../../design/exo_widgets.dart';

/// Capture tab — voice note placeholder (mic permission declared in platform manifests).
class CaptureScreen extends StatelessWidget {
  const CaptureScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ExoEmptyState(
      title: 'Voice capture',
      subtitle: 'Push-to-talk capture ships in v1.1.\nMicrophone permission is ready on this device.',
      actionLabel: 'Learn more',
      onAction: () {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Capture will sync notes to your desktop brain.')),
        );
      },
    );
  }
}
