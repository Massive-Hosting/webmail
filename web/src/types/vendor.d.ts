// Type declarations for packages without bundled types

declare module "@jitsi/rnnoise-wasm" {
  interface RNNoiseModule {
    DenoiseState: new () => DenoiseState;
  }
  interface DenoiseState {
    processFrame(frame: Float32Array): number;
    destroy(): void;
  }
  function createRNNoise(options?: { locateFile?: (file: string) => string }): Promise<RNNoiseModule>;
  export default createRNNoise;
}
