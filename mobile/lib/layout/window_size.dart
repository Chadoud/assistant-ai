import 'package:flutter/material.dart';

/// Material 3 window size classes for adaptive layout.
enum ExoWindowSize { compact, medium, expanded }

ExoWindowSize exoWindowSizeOf(BuildContext context) {
  final width = MediaQuery.sizeOf(context).width;
  if (width < 600) return ExoWindowSize.compact;
  if (width < 840) return ExoWindowSize.medium;
  return ExoWindowSize.expanded;
}

bool exoUseNavigationRail(BuildContext context) {
  return exoWindowSizeOf(context) != ExoWindowSize.compact;
}
