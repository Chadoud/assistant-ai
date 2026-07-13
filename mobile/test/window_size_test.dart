import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:exosites_mobile/layout/window_size.dart';

void main() {
  testWidgets('compact width uses bottom navigation pattern', (tester) async {
    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(size: Size(390, 844)),
        child: MaterialApp(
          home: Builder(
            builder: (context) {
              expect(exoWindowSizeOf(context), ExoWindowSize.compact);
              expect(exoUseNavigationRail(context), isFalse);
              return const SizedBox();
            },
          ),
        ),
      ),
    );
  });

  testWidgets('tablet width uses navigation rail', (tester) async {
    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(size: Size(900, 1200)),
        child: MaterialApp(
          home: Builder(
            builder: (context) {
              expect(exoWindowSizeOf(context), ExoWindowSize.expanded);
              expect(exoUseNavigationRail(context), isTrue);
              return const SizedBox();
            },
          ),
        ),
      ),
    );
  });
}
