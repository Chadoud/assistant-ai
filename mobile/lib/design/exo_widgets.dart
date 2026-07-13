import 'package:flutter/material.dart';

import 'exo_colors.dart';
import 'exo_spacing.dart';

/// Branded card container.
class ExoCard extends StatelessWidget {
  const ExoCard({super.key, required this.child, this.padding});

  final Widget child;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: padding ?? const EdgeInsets.all(ExoSpacing.lg),
        child: child,
      ),
    );
  }
}

/// Primary CTA with minimum touch target.
class ExoPrimaryButton extends StatelessWidget {
  const ExoPrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.busy = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: busy ? null : onPressed,
      child: busy
          ? const SizedBox(
              height: 20,
              width: 20,
              child: CircularProgressIndicator(strokeWidth: 2, color: ExoColors.textPrimary),
            )
          : Text(label),
    );
  }
}

/// Plain-language sync / status banner.
class ExoSyncStatusBanner extends StatelessWidget {
  const ExoSyncStatusBanner({super.key, required this.message, this.isError = false});

  final String message;
  final bool isError;

  @override
  Widget build(BuildContext context) {
    final bg = isError ? ExoColors.error.withValues(alpha: 0.12) : ExoColors.accentLight;
    final border = isError ? ExoColors.error.withValues(alpha: 0.35) : ExoColors.brandPrimary.withValues(alpha: 0.35);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(ExoSpacing.md),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: border),
      ),
      child: Text(message, style: Theme.of(context).textTheme.bodyMedium),
    );
  }
}

/// Empty state with one clear next action.
class ExoEmptyState extends StatelessWidget {
  const ExoEmptyState({
    super.key,
    required this.title,
    required this.subtitle,
    this.actionLabel,
    this.onAction,
  });

  final String title;
  final String subtitle;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: ExoSpacing.contentMaxWidth),
        child: Padding(
          padding: const EdgeInsets.all(ExoSpacing.xl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(title, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: ExoSpacing.sm),
              Text(subtitle, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
              if (actionLabel != null && onAction != null) ...[
                const SizedBox(height: ExoSpacing.lg),
                ExoPrimaryButton(label: actionLabel!, onPressed: onAction),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Centers content on wide screens.
class ExoContentWidth extends StatelessWidget {
  const ExoContentWidth({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: ExoSpacing.contentMaxWidth),
        child: child,
      ),
    );
  }
}
