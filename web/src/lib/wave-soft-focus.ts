/**
 * Wave Soft Focus — applies a subtle blur to the outgoing video stream.
 * Processes frames through a canvas with CSS filter blur.
 * Much lighter than background segmentation — just a full-frame blur.
 */

export class SoftFocusProcessor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private videoEl: HTMLVideoElement;
  private running = false;
  private animFrame = 0;
  private outputStream: MediaStream | null = null;
  private blurPx = 0;
  private width = 640;
  private height = 480;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d")!;
    this.videoEl = document.createElement("video");
    this.videoEl.playsInline = true;
    this.videoEl.muted = true;
  }

  setInput(stream: MediaStream) {
    this.videoEl.srcObject = stream;
    this.videoEl.play().catch(() => {});
    const track = stream.getVideoTracks()[0];
    if (track) {
      const settings = track.getSettings();
      this.width = settings.width || 640;
      this.height = settings.height || 480;
      this.canvas.width = this.width;
      this.canvas.height = this.height;
    }
  }

  setBlur(px: number) {
    this.blurPx = px;
  }

  start(): MediaStream {
    if (this.running && this.outputStream) return this.outputStream;
    this.running = true;
    this.outputStream = this.canvas.captureStream(30);
    this.processFrame();
    return this.outputStream;
  }

  private processFrame = () => {
    if (!this.running) return;
    if (this.videoEl.readyState >= 2) {
      if (this.blurPx > 0) {
        this.ctx.filter = `blur(${this.blurPx}px)`;
      } else {
        this.ctx.filter = "none";
      }
      this.ctx.drawImage(this.videoEl, 0, 0, this.width, this.height);
      this.ctx.filter = "none";
    }
    this.animFrame = requestAnimationFrame(this.processFrame);
  };

  stop() {
    this.running = false;
    cancelAnimationFrame(this.animFrame);
    if (this.outputStream) {
      for (const track of this.outputStream.getTracks()) track.stop();
      this.outputStream = null;
    }
  }
}
