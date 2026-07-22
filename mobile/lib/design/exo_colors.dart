import 'package:flutter/material.dart';

/// Flat brand palette — one solid canvas, elevated panels only (no gradients).
abstract final class ExoColors {
  static const brandPrimary = Color(0xFF6E72F5);
  static const brandSecondary = Color(0xFF9AA0FF);
  static const brandDeep = Color(0xFF3F3D99);

  /// Single app canvas — scaffold, nav, app bar, inputs.
  static const bgPrimary = Color(0xFF0C0B14);

  /// Alias kept for call sites; same solid as [bgPrimary] (no layered wash).
  static const bgSecondary = bgPrimary;

  static const bgElevated = Color(0xFF161522);

  static const textPrimary = Color(0xFFF2F1F8);
  static const textSecondary = Color(0xFFA9A7BC);
  static const textMuted = Color(0xFF7A788F);

  static const buttonPrimary = Color(0xFF5B5FE8);
  static const border = Color(0xFF2A2840);
  static const borderStrong = Color(0xFF3A3758);

  static const success = Color(0xFF3D9B6E);
  static const error = Color(0xFFE05757);
  static const warning = Color(0xFFD99A2B);

  /// Alias used by existing call sites.
  static Color get bgCard => bgElevated;

  static Color get accentLight => brandPrimary.withValues(alpha: 0.12);

  static Color get errorSoft => error.withValues(alpha: 0.12);
}
