/**
 * Wave Noise Suppression — RNNoise-based noise cancellation
 *
 * Uses @jitsi/rnnoise-wasm to process audio frames and remove background noise.
 * RNNoise operates on 480-sample frames at 48kHz.
 */

interface RNNoiseDenoiseState {
  processFrame(frame: Float32Array): void;
  destroy(): void;
}

interface RNNoiseModule {
  DenoiseState: new () => RNNoiseDenoiseState;
}

const RNNOISE_SAMPLE_LENGTH = 480;

let rnnoiseModule: RNNoiseModule | null = null;

async function loadRNNoise(): Promise<RNNoiseModule> {
  if (rnnoiseModule) return rnnoiseModule;

  // Dynamic import of the rnnoise-wasm module
  const { default: createRNNoise } = await import("@jitsi/rnnoise-wasm");
  rnnoiseModule = await createRNNoise({
    locateFile: (file: string) => {
      if (file.endsWith(".wasm")) return "/rnnoise/rnnoise.wasm";
      return file;
    },
  }) as RNNoiseModule;
  return rnnoiseModule;
}

/**
 * NoiseSuppressor — wraps an audio MediaStream with RNNoise processing.
 * Returns a new MediaStream with noise-suppressed audio.
 */
export class NoiseSuppressor {
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private denoiseState: RNNoiseDenoiseState | null = null;
  private running = false;

  async start(inputStream: MediaStream): Promise<MediaStream> {
    const rnnoise = await loadRNNoise();

    this.ctx = new AudioContext({ sampleRate: 48000 });
    if (this.ctx.state === "suspended") await this.ctx.resume();

    this.source = this.ctx.createMediaStreamSource(inputStream);
    // ScriptProcessorNode is deprecated but AudioWorklet requires a separate file.
    // For simplicity, use ScriptProcessorNode with the correct buffer size.
    this.processor = this.ctx.createScriptProcessor(4096, 1, 1);
    this.destination = this.ctx.createMediaStreamDestination();

    this.denoiseState = new (rnnoise.DenoiseState)();
    this.running = true;

    // Buffer to accumulate samples for 480-sample frame processing
    const inputBuffer: number[] = [];

    this.processor.onaudioprocess = (e) => {
      if (!this.running || !this.denoiseState) return;

      const input = e.inputBuffer.getChannelData(0);
      const output = e.outputBuffer.getChannelData(0);

      // Add input samples to buffer
      for (let i = 0; i < input.length; i++) {
        inputBuffer.push(input[i] * 32768); // Convert float to int16 range
      }

      let outputIdx = 0;

      // Process complete 480-sample frames
      while (inputBuffer.length >= RNNOISE_SAMPLE_LENGTH && outputIdx + RNNOISE_SAMPLE_LENGTH <= output.length) {
        const frame = new Float32Array(inputBuffer.splice(0, RNNOISE_SAMPLE_LENGTH));
        this.denoiseState.processFrame(frame);

        for (let i = 0; i < RNNOISE_SAMPLE_LENGTH && outputIdx < output.length; i++) {
          output[outputIdx++] = frame[i] / 32768; // Convert back to float
        }
      }

      // Fill remaining output with silence (avoids clicks)
      while (outputIdx < output.length) {
        output[outputIdx++] = 0;
      }
    };

    this.source.connect(this.processor);
    this.processor.connect(this.destination);

    // Return a new stream with the processed audio + original video tracks
    const outputStream = this.destination.stream;
    // Copy video tracks from input (if any)
    for (const track of inputStream.getVideoTracks()) {
      outputStream.addTrack(track);
    }

    return outputStream;
  }

  stop() {
    this.running = false;
    this.processor?.disconnect();
    this.source?.disconnect();
    if (this.denoiseState) {
      try { this.denoiseState.destroy(); } catch { /* ignore */ }
      this.denoiseState = null;
    }
    if (this.ctx && this.ctx.state !== "closed") {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.source = null;
    this.processor = null;
    this.destination = null;
  }
}
