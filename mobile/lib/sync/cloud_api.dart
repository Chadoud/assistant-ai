import 'dart:convert';

import 'package:http/http.dart' as http;

/// Cloud relay HTTP client — auth, device registration, blob push/pull.
class CloudApi {
  CloudApi({required this.baseUrl, required this.accessToken});

  final String baseUrl;
  final String accessToken;

  Map<String, String> get _headers => {
        'Authorization': 'Bearer $accessToken',
        'Content-Type': 'application/json',
      };

  Future<Map<String, dynamic>> syncStatus() async {
    final res = await http.get(Uri.parse('$baseUrl/v1/sync/status'), headers: _headers);
    _ensureOk(res);
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> registerDevice({
    required String deviceId,
    required String name,
    String platform = 'ios',
    String? pushToken,
  }) async {
    final res = await http.post(
      Uri.parse('$baseUrl/v1/sync/devices/register'),
      headers: _headers,
      body: jsonEncode({
        'device_id': deviceId,
        'name': name,
        'platform': platform,
        'push_token': pushToken,
      }),
    );
    _ensureOk(res);
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> pushBlobs(List<Map<String, dynamic>> blobs) async {
    final res = await http.post(
      Uri.parse('$baseUrl/v1/sync/blobs/push'),
      headers: _headers,
      body: jsonEncode({'blobs': blobs}),
    );
    _ensureOk(res);
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> pullBlobs({int cursor = 0, int limit = 200}) async {
    final uri = Uri.parse('$baseUrl/v1/sync/blobs/pull').replace(
      queryParameters: {'cursor': '$cursor', 'limit': '$limit'},
    );
    final res = await http.get(uri, headers: _headers);
    _ensureOk(res);
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  void _ensureOk(http.Response res) {
    if (res.statusCode >= 400) {
      throw CloudApiException(res.statusCode, res.body);
    }
  }
}

class CloudApiException implements Exception {
  CloudApiException(this.statusCode, this.body);
  final int statusCode;
  final String body;

  @override
  String toString() => 'CloudApiException($statusCode): $body';
}
