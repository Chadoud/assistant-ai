import 'package:flutter/material.dart';

import '../../design/exo_colors.dart';
import '../../design/exo_spacing.dart';
import '../../design/exo_theme.dart';
import '../../sync/user_messages.dart';

/// Presentational memory row — title, preview, optional category + relative time.
class MemoryListTile extends StatelessWidget {
  const MemoryListTile({
    super.key,
    required this.payload,
    this.updatedAt,
    this.selected = false,
    this.onTap,
  });

  final Map<String, dynamic> payload;
  final String? updatedAt;
  final bool selected;
  final VoidCallback? onTap;

  static String titleOf(Map<String, dynamic> payload) {
    final key = payload['key']?.toString().trim();
    if (key != null && key.isNotEmpty) return key;
    final content = payload['content']?.toString().trim();
    if (content != null && content.isNotEmpty) {
      return content.length > 80 ? '${content.substring(0, 80)}…' : content;
    }
    final desc = payload['description']?.toString().trim();
    if (desc != null && desc.isNotEmpty) return desc;
    return SyncUserMessages.memoryFallbackTitle;
  }

  static String? previewOf(Map<String, dynamic> payload) {
    final content = payload['content']?.toString().trim();
    final key = payload['key']?.toString().trim();
    if (content != null && content.isNotEmpty && content != key) return content;
    final desc = payload['description']?.toString().trim();
    if (desc != null && desc.isNotEmpty && desc != key) return desc;
    return null;
  }

  static String? relativeTime(String? iso) {
    if (iso == null || iso.isEmpty) return null;
    final dt = DateTime.tryParse(iso);
    if (dt == null) return null;
    final diff = DateTime.now().toUtc().difference(dt.toUtc());
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inHours < 1) return '${diff.inMinutes}m ago';
    if (diff.inDays < 1) return '${diff.inHours}h ago';
    if (diff.inDays < 30) return '${diff.inDays}d ago';
    return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final title = titleOf(payload);
    final preview = previewOf(payload);
    final category = payload['category']?.toString().trim();
    final time = relativeTime(updatedAt);

    return Material(
      color: selected ? ExoColors.accentLight : Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: ExoSpacing.lg,
            vertical: ExoSpacing.md,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: ExoColors.textPrimary,
                    ),
              ),
              if (preview != null) ...[
                const SizedBox(height: ExoSpacing.xs),
                Text(
                  preview,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
              if ((category != null && category.isNotEmpty) || time != null) ...[
                const SizedBox(height: ExoSpacing.sm),
                Row(
                  children: [
                    if (category != null && category.isNotEmpty)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: ExoSpacing.sm,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: ExoColors.bgElevated,
                          borderRadius: BorderRadius.circular(ExoTheme.radius / 2),
                          border: Border.all(color: ExoColors.border),
                        ),
                        child: Text(
                          category,
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: ExoColors.textSecondary,
                                fontWeight: FontWeight.w500,
                              ),
                        ),
                      ),
                    if (category != null && category.isNotEmpty && time != null)
                      const SizedBox(width: ExoSpacing.sm),
                    if (time != null)
                      Text(time, style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
