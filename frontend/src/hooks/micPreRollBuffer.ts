/**
 * Rolling buffer of recent mic PCM while the echo gate sends silence to Gemini.
 * When the gate opens (AI finished or barge-in), drain first so utterance starts
 * are not lost to speaker-echo protection.
 */
export class MicPreRollBuffer {
  private chunks: ArrayBuffer[] = [];
  private readonly maxChunks: number;

  constructor(maxChunks: number) {
    this.maxChunks = maxChunks;
  }

  /** Store a copy of one 16 kHz mono Int16 PCM chunk. */
  push(pcm: ArrayBuffer): void {
    this.chunks.push(pcm.slice(0));
    if (this.chunks.length > this.maxChunks) {
      this.chunks.shift();
    }
  }

  /** Remove and return all buffered chunks in capture order. */
  drain(): ArrayBuffer[] {
    const buffered = this.chunks;
    this.chunks = [];
    return buffered;
  }

  clear(): void {
    this.chunks = [];
  }
}
