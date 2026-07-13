import 'package:flutter/material.dart';

import 'exo_colors.dart';
import 'exo_spacing.dart';

/// Exo dark theme — mirrors desktop semantic tokens.
abstract final class ExoTheme {
  static ThemeData dark() {
    final scheme = ColorScheme.dark(
      primary: ExoColors.brandPrimary,
      onPrimary: ExoColors.textPrimary,
      secondary: ExoColors.brandSecondary,
      surface: ExoColors.bgCard,
      onSurface: ExoColors.textPrimary,
      error: ExoColors.error,
      onError: ExoColors.textPrimary,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: scheme,
      scaffoldBackgroundColor: ExoColors.bgPrimary,
      appBarTheme: const AppBarTheme(
        backgroundColor: ExoColors.bgPrimary,
        foregroundColor: ExoColors.textPrimary,
        elevation: 0,
        centerTitle: false,
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: ExoColors.bgCard,
        indicatorColor: ExoColors.accentLight,
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return TextStyle(
            fontSize: 12,
            fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
            color: selected ? ExoColors.textPrimary : ExoColors.textMuted,
          );
        }),
      ),
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: ExoColors.bgCard,
        indicatorColor: ExoColors.accentLight,
        selectedIconTheme: const IconThemeData(color: ExoColors.brandPrimary),
        unselectedIconTheme: IconThemeData(color: ExoColors.textMuted),
        labelType: NavigationRailLabelType.all,
      ),
      cardTheme: CardThemeData(
        color: ExoColors.bgCard,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: ExoColors.border.withValues(alpha: 0.5)),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: ExoColors.buttonPrimary,
          foregroundColor: ExoColors.textPrimary,
          minimumSize: const Size(48, 48),
          padding: const EdgeInsets.symmetric(horizontal: ExoSpacing.lg, vertical: ExoSpacing.md),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: ExoColors.bgSecondary,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: ExoColors.border.withValues(alpha: 0.6)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: ExoColors.brandPrimary, width: 2),
        ),
        labelStyle: TextStyle(color: ExoColors.textMuted),
        hintStyle: TextStyle(color: ExoColors.textMuted.withValues(alpha: 0.8)),
      ),
      textTheme: TextTheme(
        headlineSmall: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: ExoColors.textPrimary),
        titleMedium: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: ExoColors.textPrimary),
        bodyLarge: const TextStyle(fontSize: 16, height: 1.5, color: ExoColors.textPrimary),
        bodyMedium: const TextStyle(fontSize: 14, height: 1.45, color: ExoColors.textPrimary),
        bodySmall: TextStyle(fontSize: 12, color: ExoColors.textMuted),
      ),
    );
  }
}
