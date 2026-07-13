import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../design/exo_spacing.dart';
import '../../design/exo_widgets.dart';
import 'mobile_sync_config.dart';

/// Scan desktop QR to import wrapped master key + cloud URL.
class PairingScreen extends StatefulWidget {
  const PairingScreen({super.key, required this.config});

  final MobileSyncConfig config;

  @override
  State<PairingScreen> createState() => _PairingScreenState();
}

class _PairingScreenState extends State<PairingScreen> {
  bool _done = false;
  String? _error;

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_done) return;
    final raw = capture.barcodes.firstOrNull?.rawValue;
    if (raw == null || raw.isEmpty) return;
    try {
      final payload = jsonDecode(raw) as Map<String, dynamic>;
      if (payload['v'] != 1) {
        throw const FormatException('Unsupported pairing version');
      }
      await widget.config.applyPairingPayload(payload);
      if (mounted) {
        setState(() {
          _done = true;
          _error = null;
        });
        Navigator.pop(context, true);
      }
    } catch (e) {
      if (mounted) setState(() => _error = 'Could not read that QR code. Try again from desktop Settings → Sync.');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Pair with desktop')),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.all(ExoSpacing.lg),
            child: Text(
              'On desktop: Settings → Sync → Pair mobile device. Scan the QR code shown there.',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: ExoSpacing.lg),
              child: ExoSyncStatusBanner(message: _error!, isError: true),
            ),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: Padding(
                padding: const EdgeInsets.all(ExoSpacing.lg),
                child: MobileScanner(onDetect: _onDetect),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
