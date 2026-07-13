import 'package:exosites_mobile/telemetry/mobile_crash_reporter.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('truncateForIngest respects max length', () {
    expect(truncateForIngest('abc', 10), 'abc');
    expect(truncateForIngest('abcdefghij', 5), 'abcde');
  });

  test('MobileCrashReporter skips when opt-in is false', () async {
    final reporter = MobileCrashReporter(
      crashIngestUrl: 'https://api.example.test/v1/crash-reports',
      crashIngestToken: 'token',
    );
    reporter.setOptIn(false);
    await reporter.reportError(Exception('boom'), StackTrace.current);
    reporter.dispose();
  });
}
