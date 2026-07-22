import 'package:exosites_mobile/app/mobile_sync_config.dart';
import 'package:exosites_mobile/design/exo_status_banner.dart';
import 'package:exosites_mobile/design/exo_theme.dart';
import 'package:exosites_mobile/features/memory/memory_screen.dart';
import 'package:exosites_mobile/features/setup/setup_sign_in_panel.dart';
import 'package:exosites_mobile/features/today/today_screen.dart';
import 'package:exosites_mobile/layout/adaptive_shell.dart';
import 'package:exosites_mobile/sync/key_value_store.dart';
import 'package:exosites_mobile/sync/local_store.dart';
import 'package:exosites_mobile/sync/user_messages.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

Widget _app(Widget child, {Size size = const Size(390, 844)}) {
  return MaterialApp(
    theme: ExoTheme.dark(),
    home: MediaQuery(
      data: MediaQueryData(size: size),
      child: Scaffold(body: child),
    ),
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  group('SetupSignInPanel', () {
    testWidgets('shows email sign-in and toggles create-account title', (tester) async {
      var googleTaps = 0;
      await tester.pumpWidget(
        _app(
          SingleChildScrollView(
            child: SetupSignInPanel(
              launchingBrowser: false,
              waitingBrowser: false,
              emailBusy: false,
              error: null,
              onGoogle: () => googleTaps++,
              onApple: () {},
              onEmailLogin: (_, __) async {},
              onEmailRegister: (_, __) async {},
            ),
          ),
        ),
      );

      expect(find.text(SyncUserMessages.setupTitle), findsOneWidget);
      expect(find.text(SyncUserMessages.signIn), findsOneWidget);
      expect(find.text(SyncUserMessages.signInWithGoogle), findsOneWidget);
      expect(find.text(SyncUserMessages.signInWithApple), findsOneWidget);

      await tester.tap(find.text(SyncUserMessages.noAccountCreate));
      await tester.pump();
      expect(find.text(SyncUserMessages.setupTitleCreate), findsOneWidget);
      expect(find.text(SyncUserMessages.createAccount), findsOneWidget);

      await tester.tap(find.text(SyncUserMessages.signInWithGoogle));
      expect(googleTaps, 1);
    });

    testWidgets('shows error banner and waiting-for-browser CTA', (tester) async {
      var openAgain = 0;
      await tester.pumpWidget(
        _app(
          SingleChildScrollView(
            child: SetupSignInPanel(
              launchingBrowser: false,
              waitingBrowser: true,
              emailBusy: false,
              error: SyncUserMessages.cloudUnreachable,
              onGoogle: () => openAgain++,
              onApple: () {},
              onEmailLogin: (_, __) async {},
              onEmailRegister: (_, __) async {},
            ),
          ),
        ),
      );

      expect(find.text(SyncUserMessages.waitingForGoogle), findsOneWidget);
      expect(find.text(SyncUserMessages.cloudUnreachable), findsOneWidget);
      await tester.tap(find.text(SyncUserMessages.openSignInAgain));
      expect(openAgain, 1);
    });
  });

  group('ExoStatusBanner CTA', () {
    testWidgets('invokes onAction when CTA is tapped', (tester) async {
      var taps = 0;
      await tester.pumpWidget(
        _app(
          ExoStatusBanner(
            kind: ExoStatusKind.networkError,
            message: SyncUserMessages.networkFailed,
            actionLabel: SyncUserMessages.tryAgain,
            onAction: () => taps++,
          ),
        ),
      );

      expect(find.text(SyncUserMessages.networkFailed), findsOneWidget);
      await tester.tap(find.text(SyncUserMessages.tryAgain));
      expect(taps, 1);
    });
  });

  group('AdaptiveShell', () {
    late MobileSyncConfig config;

    setUp(() async {
      config = MobileSyncConfig(
        storage: MemoryKeyValueStore(),
        localStore: LocalBrainStore(databasePath: ':memory:'),
      );
      await config.hydrate();
    });

    testWidgets('phone shell shows Today Memory Search destinations', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: ExoTheme.dark(),
          home: MediaQuery(
            data: const MediaQueryData(size: Size(390, 844)),
            child: AdaptiveShell(config: config),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Today'), findsWidgets);
      expect(find.text('Memory'), findsWidgets);
      expect(find.text('Search'), findsWidgets);
      expect(find.text('Capture'), findsNothing);
      // Default tab is Memory.
      expect(find.text(SyncUserMessages.memoriesTitle), findsOneWidget);
    });

    testWidgets('switching to Today shows sync CTA and empty recent', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: ExoTheme.dark(),
          home: MediaQuery(
            data: const MediaQueryData(size: Size(390, 844)),
            child: AdaptiveShell(config: config, initialTab: 0),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text(SyncUserMessages.syncNow), findsWidgets);
      expect(find.text(SyncUserMessages.memoryEmptyTitle), findsOneWidget);
    });
  });

  group('Empty Memory / Today', () {
    late MobileSyncConfig config;

    setUp(() async {
      config = MobileSyncConfig(
        storage: MemoryKeyValueStore(),
        localStore: LocalBrainStore(databasePath: ':memory:'),
      );
      await config.hydrate();
    });

    testWidgets('MemoryScreen empty state copy', (tester) async {
      await tester.pumpWidget(
        _app(MemoryScreen(config: config, showAppBarBanner: false)),
      );
      await tester.pumpAndSettle();

      expect(find.text(SyncUserMessages.memoryEmptyTitle), findsOneWidget);
      expect(find.text(SyncUserMessages.memoryEmptySubtitle), findsOneWidget);
    });

    testWidgets('TodayScreen loads without crash when unsigned', (tester) async {
      await tester.pumpWidget(_app(TodayScreen(config: config)));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  });
}
