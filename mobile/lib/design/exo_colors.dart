import 'package:flutter/material.dart';

/// Brand palette aligned with [frontend/src/styles/tokens.css].
abstract final class ExoColors {
  static const brandPrimary = Color(0xFF6366F1);
  static const brandSecondary = Color(0xFF818CF8);
  static const brandTertiary = Color(0xFF3730A3);
  static const bgPrimary = Color(0xFF0F0B2E);
  static const bgSecondary = Color(0xFF0A0619);
  static const textPrimary = Color(0xFFEEF2FF);
  static const buttonPrimary = Color(0xFF4F46E5);
  static const buttonPrimaryHover = Color(0xFF4338CA);
  static const success = Color(0xFF4CAF7D);
  static const error = Color(0xFFEF5350);
  static const warning = Color(0xFFF5A623);

  /// Card surface: primary bg tinted with brand secondary (~12%).
  static Color get bgCard => Color.lerp(bgPrimary, brandSecondary, 0.12)!;

  /// Muted body text.
  static Color get textMuted => Color.lerp(textPrimary, brandSecondary, 0.45)!;

  static Color get border => Color.lerp(brandTertiary, bgPrimary, 0.30)!;

  static Color get accentLight => brandPrimary.withValues(alpha: 0.15);
}
