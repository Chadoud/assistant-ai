/**
 * AudioWorklet processor: captures raw PCM from the microphone at the native
 * sample rate, converts it to 16-bit signed int (Int16Array), and sends
 * 1024-sample chunks to the main thread.
 *
 * The browser resamples to 16 kHz via AudioContext.sampleRate. The worklet
 * must be loaded from the same origin as the app (served from /public).
 */

class VoiceCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    /** Accumulate samples until we have a full chunk to send. */
    this._buffer = new Float32Array(1024);
    this._bufferLen = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channel = input[0]; // mono — use first channel only
    if (!channel) return true;

    let offset = 0;
    while (offset < channel.length) {
      const remaining = 1024 - this._bufferLen;
      const toCopy = Math.min(remaining, channel.length - offset);
      this._buffer.set(channel.subarray(offset, offset + toCopy), this._bufferLen);
      this._bufferLen += toCopy;
      offset += toCopy;

      if (this._bufferLen === 1024) {
        // Convert Float32 → Int16
        const int16 = new Int16Array(1024);
        for (let i = 0; i < 1024; i++) {
          const s = Math.max(-1, Math.min(1, this._buffer[i]));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        this.port.postMessage({ pcm: int16.buffer }, [int16.buffer]);
        this._buffer = new Float32Array(1024);
        this._bufferLen = 0;
      }
    }
    return true;
  }
}

registerProcessor("voice-capture-processor", VoiceCaptureProcessor);
