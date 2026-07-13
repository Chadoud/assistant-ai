import 'package:exosites_mobile/layout/adaptive_shell.dart';
import 'package:exosites_mobile/features/settings/mobile_sync_config.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('Exo adaptive shell renders navigation', (tester) async {
    final config = MobileSyncConfig();
    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(size: Size(390, 844)),
        child: MaterialApp(
          home: AdaptiveShell(config: config),
        ),
      ),
    );
    await tester.pump();
    expect(find.byType(NavigationBar), findsOneWidget);
    expect(find.text('Sync now'), findsOneWidget);
  });
}
