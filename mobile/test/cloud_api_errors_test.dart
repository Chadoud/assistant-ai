import 'package:exosites_mobile/sync/cloud_api.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('CloudApiException carries status code and body', () {
    final ex = CloudApiException(401, '{"detail":"invalid_token"}');
    expect(ex.statusCode, 401);
    expect(ex.body, contains('invalid_token'));
    expect(ex.toString(), contains('401'));
  });
}
