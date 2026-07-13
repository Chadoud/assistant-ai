/// Thrown when GO SYNC master key is missing — user must pair with desktop.
class SyncNotPairedException implements Exception {
  @override
  String toString() => 'SyncNotPairedException: pair with desktop in Settings first';
}
