import 'package:flutter/material.dart';

import 'exo_colors.dart';

/// Isometric Exo cube (matches `assets/exo_cube.svg` / favicon) — draws itself.
class ExoCubeDraw extends StatelessWidget {
  const ExoCubeDraw({
    super.key,
    required this.progress,
    this.size = 96,
    this.strokeColor = ExoColors.textPrimary,
    this.strokeWidth = 2.4,
  });

  /// 0 = blank, 1 = fully drawn.
  final double progress;
  final double size;
  final Color strokeColor;
  final double strokeWidth;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Exo',
      child: SizedBox(
        width: size,
        height: size,
        child: CustomPaint(
          painter: _ExoCubePainter(
            progress: progress.clamp(0.0, 1.0),
            strokeColor: strokeColor,
            strokeWidth: strokeWidth,
          ),
        ),
      ),
    );
  }
}

/// Animated boot mark — draws the cube once, then reports completion.
class ExoCubeIntro extends StatefulWidget {
  const ExoCubeIntro({
    super.key,
    this.size = 112,
    this.duration = const Duration(milliseconds: 1400),
    this.onComplete,
  });

  final double size;
  final Duration duration;
  final VoidCallback? onComplete;

  @override
  State<ExoCubeIntro> createState() => _ExoCubeIntroState();
}

class _ExoCubeIntroState extends State<ExoCubeIntro> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: widget.duration,
  );

  @override
  void initState() {
    super.initState();
    _controller.addStatusListener((status) {
      if (status == AnimationStatus.completed) {
        widget.onComplete?.call();
      }
    });
    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        final t = Curves.easeInOutCubic.transform(_controller.value);
        return ExoCubeDraw(progress: t, size: widget.size);
      },
    );
  }
}

/// Full-screen boot: solid canvas + self-drawing cube (replaces spinner / favicon).
class ExoBootScreen extends StatelessWidget {
  const ExoBootScreen({
    super.key,
    required this.onIntroComplete,
  });

  final VoidCallback onIntroComplete;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ExoColors.bgPrimary,
      body: Center(
        child: ExoCubeIntro(onComplete: onIntroComplete),
      ),
    );
  }
}

class _ExoCubePainter extends CustomPainter {
  _ExoCubePainter({
    required this.progress,
    required this.strokeColor,
    required this.strokeWidth,
  });

  final double progress;
  final Color strokeColor;
  final double strokeWidth;

  /// Outer hexagon — drawn in the first ~58% of the animation.
  static Path outerPath() {
    return Path()
      ..moveTo(24, 8)
      ..lineTo(38, 16)
      ..lineTo(38, 32)
      ..lineTo(24, 40)
      ..lineTo(10, 32)
      ..lineTo(10, 16)
      ..close();
  }

  /// Internal Y edges — drawn in the remaining ~42%.
  static Path innerPath() {
    return Path()
      ..moveTo(24, 8)
      ..lineTo(24, 24)
      ..moveTo(10, 16)
      ..lineTo(24, 24)
      ..lineTo(38, 16)
      ..moveTo(24, 24)
      ..lineTo(24, 40);
  }

  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.shortestSide / 48;
    canvas.scale(scale);

    final paint = Paint()
      ..color = strokeColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..isAntiAlias = true;

    const outerShare = 0.58;
    if (progress <= 0) return;

    if (progress < outerShare) {
      _drawPartial(canvas, outerPath(), progress / outerShare, paint);
      return;
    }

    _drawPartial(canvas, outerPath(), 1, paint);
    _drawPartial(canvas, innerPath(), (progress - outerShare) / (1 - outerShare), paint);
  }

  void _drawPartial(Canvas canvas, Path path, double t, Paint paint) {
    if (t <= 0) return;
    if (t >= 1) {
      canvas.drawPath(path, paint);
      return;
    }
    for (final metric in path.computeMetrics()) {
      canvas.drawPath(metric.extractPath(0, metric.length * t), paint);
    }
  }

  @override
  bool shouldRepaint(covariant _ExoCubePainter oldDelegate) {
    return oldDelegate.progress != progress ||
        oldDelegate.strokeColor != strokeColor ||
        oldDelegate.strokeWidth != strokeWidth;
  }
}

/// Path lengths in viewBox units — for unit tests.
double exoCubeOuterPathLength() {
  var total = 0.0;
  for (final m in _ExoCubePainter.outerPath().computeMetrics()) {
    total += m.length;
  }
  return total;
}

double exoCubeInnerPathLength() {
  var total = 0.0;
  for (final m in _ExoCubePainter.innerPath().computeMetrics()) {
    total += m.length;
  }
  return total;
}
