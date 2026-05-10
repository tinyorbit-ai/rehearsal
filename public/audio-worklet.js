// AudioWorklet processor — captures PCM and emits chunks + RMS to main thread.
// Loaded via audioContext.audioWorklet.addModule("/audio-worklet.js").
class PCMCollector extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    this.bufferLen = 0;
    // Flush ~every 250ms at 16kHz (4000 samples) — keeps latency low.
    this.flushAt = 4000;
    this.rmsSum = 0;
    this.rmsCount = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channel = input[0];

    // Track RMS for silence detection
    for (let i = 0; i < channel.length; i++) {
      const v = channel[i];
      this.rmsSum += v * v;
    }
    this.rmsCount += channel.length;

    // Buffer the chunk
    this.buffer.push(new Float32Array(channel));
    this.bufferLen += channel.length;

    if (this.bufferLen >= this.flushAt) {
      const merged = new Float32Array(this.bufferLen);
      let offset = 0;
      for (const chunk of this.buffer) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      const rms = this.rmsCount > 0 ? Math.sqrt(this.rmsSum / this.rmsCount) : 0;
      this.port.postMessage(
        { type: "chunk", pcm: merged, rms, sampleRate },
        [merged.buffer],
      );
      this.buffer = [];
      this.bufferLen = 0;
      this.rmsSum = 0;
      this.rmsCount = 0;
    }
    return true;
  }
}

registerProcessor("pcm-collector", PCMCollector);
