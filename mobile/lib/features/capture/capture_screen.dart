import 'package:flutter/material.dart';

import '../../design/exo_widgets.dart';
import '../../sync/user_messages.dart';

/// Capture tab — deferred until Store GA (no mic permission in beta manifests).
class CaptureScreen extends StatelessWidget {
  const CaptureScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const ExoEmptyState(
      title: 'Coming in a later update',
      subtitle: SyncUserMessages.captureComingSoon,
    );
  }
}
