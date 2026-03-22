/**
 * Wave Background Effects — blur, virtual backgrounds using MediaPipe
 *
 * Uses MediaPipe Image Segmenter (selfie segmentation) to separate
 * person from background, then composites with blur or image replacement.
 */

// @ts-expect-error — MediaPipe tasks-vision doesn't ship type declarations
import { ImageSegmenter, FilesetResolver } from "@mediapipe/tasks-vision";

export type BackgroundMode = "none" | "blur" | "image";

export interface BackgroundEffect {
  mode: BackgroundMode;
  /** Blur strength (px) — only used when mode is "blur" */
  blurStrength?: number;
  /** Background image URL — only used when mode is "image" */
  imageUrl?: string;
}

// Predefined virtual background images (gradients rendered as data URLs)
export const VIRTUAL_BACKGROUNDS: Array<{
  id: string; mode: BackgroundMode; blurStrength?: number; label: string; preview: string;
}> = [
  { id: "blur-light", mode: "blur", blurStrength: 10, label: "Light Blur", preview: "linear-gradient(135deg, #e0e7ff, #c7d2fe)" },
  { id: "blur-strong", mode: "blur", blurStrength: 25, label: "Strong Blur", preview: "linear-gradient(135deg, #a5b4fc, #818cf8)" },
  { id: "gradient-sunset", mode: "image", label: "Sunset", preview: "linear-gradient(135deg, #f97316, #ec4899)" },
  { id: "gradient-ocean", mode: "image", label: "Ocean", preview: "linear-gradient(135deg, #06b6d4, #3b82f6)" },
  { id: "gradient-forest", mode: "image", label: "Forest", preview: "linear-gradient(135deg, #22c55e, #065f46)" },
  { id: "gradient-night", mode: "image", label: "Night", preview: "linear-gradient(135deg, #1e1b4b, #312e81)" },
  { id: "gradient-warm", mode: "image", label: "Warm", preview: "linear-gradient(135deg, #fbbf24, #f97316)" },
  { id: "gradient-cool", mode: "image", label: "Cool", preview: "linear-gradient(135deg, #6366f1, #8b5cf6)" },
];

let segmenter: ImageSegmenter | null = null;
let segmenterLoading = false;

/** Initialize MediaPipe Image Segmenter (lazy, singleton) */
async function getSegmenter(): Promise<ImageSegmenter | null> {
  if (segmenter) return segmenter;
  if (segmenterLoading) {
    // Wait for loading to complete
    while (segmenterLoading) await new Promise((r) => setTimeout(r, 100));
    return segmenter;
  }

  segmenterLoading = true;
  try {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.33/wasm"
    );
    segmenter = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      outputCategoryMask: true,
      outputConfidenceMasks: false,
    });
    return segmenter;
  } catch (e) {
    console.error("[Wave] Failed to load segmenter:", e);
    return null;
  } finally {
    segmenterLoading = false;
  }
}

/**
 * BackgroundProcessor — applies background effects to a video stream.
 * Creates a processed MediaStream from a canvas that can replace
 * the original camera stream.
 */
export class BackgroundProcessor {
  private width: number;
  private height: number;
  private canvas: OffscreenCanvas | HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  private bgCanvas: OffscreenCanvas | HTMLCanvasElement;
  private bgCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  private videoEl: HTMLVideoElement;
  private effect: BackgroundEffect = { mode: "none" };
  private running = false;
  private animFrame = 0;
  private outputStream: MediaStream | null = null;
  private bgImage: HTMLImageElement | null = null;
  private gradientBg: CanvasGradient | null = null;

  constructor(width = 640, height = 480) {
    this.width = width;
    this.height = height;
    // Use regular canvas for compatibility (OffscreenCanvas doesn't support captureStream)
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext("2d")!;

    this.bgCanvas = document.createElement("canvas");
    this.bgCanvas.width = width;
    this.bgCanvas.height = height;
    this.bgCtx = this.bgCanvas.getContext("2d")!;

    this.videoEl = document.createElement("video");
    this.videoEl.playsInline = true;
    this.videoEl.muted = true;
  }

  /** Set the input video stream */
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
      this.bgCanvas.width = this.width;
      this.bgCanvas.height = this.height;
    }
  }

  /** Set the background effect */
  setEffect(effect: BackgroundEffect) {
    this.effect = effect;

    // Pre-render gradient background
    if (effect.mode === "image" && effect.imageUrl) {
      if (effect.imageUrl.startsWith("linear-gradient")) {
        // Parse gradient and render to bgCanvas
        this.renderGradientBg(effect.imageUrl);
      } else {
        // Load image
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = effect.imageUrl;
        img.onload = () => { this.bgImage = img; };
      }
    }
  }

  private renderGradientBg(gradientCSS: string) {
    // Parse "linear-gradient(135deg, #color1, #color2)"
    const match = gradientCSS.match(/linear-gradient\((\d+)deg,\s*(#\w+),\s*(#\w+)\)/);
    if (!match) return;
    const [, angle, color1, color2] = match;
    const rad = (Number(angle) * Math.PI) / 180;
    const x1 = this.width / 2 - Math.cos(rad) * this.width;
    const y1 = this.height / 2 - Math.sin(rad) * this.height;
    const x2 = this.width / 2 + Math.cos(rad) * this.width;
    const y2 = this.height / 2 + Math.sin(rad) * this.height;
    const grad = this.bgCtx.createLinearGradient(x1, y1, x2, y2);
    grad.addColorStop(0, color1);
    grad.addColorStop(1, color2);
    this.bgCtx.fillStyle = grad;
    this.bgCtx.fillRect(0, 0, this.width, this.height);
    this.bgImage = null;
    this.gradientBg = grad;
  }

  /** Start processing and return the output MediaStream */
  async start(): Promise<MediaStream> {
    if (this.running) return this.outputStream!;

    // Pre-load segmenter
    await getSegmenter();

    this.running = true;
    const htmlCanvas = this.canvas as HTMLCanvasElement;
    this.outputStream = htmlCanvas.captureStream(30);
    this.processFrame();
    return this.outputStream;
  }

  private processFrame = async () => {
    if (!this.running) return;

    if (this.videoEl.readyState >= 2 && this.effect.mode !== "none") {
      const seg = await getSegmenter();
      if (seg) {
        try {
          const result = seg.segmentForVideo(this.videoEl, performance.now());
          const mask = result.categoryMask;

          if (mask) {
            const maskData = mask.getAsUint8Array();

            // Draw original frame
            this.ctx.drawImage(this.videoEl, 0, 0, this.width, this.height);
            const frame = this.ctx.getImageData(0, 0, this.width, this.height);

            if (this.effect.mode === "blur") {
              // Draw blurred version to bgCanvas
              this.bgCtx.filter = `blur(${this.effect.blurStrength || 15}px)`;
              this.bgCtx.drawImage(this.videoEl, 0, 0, this.width, this.height);
              this.bgCtx.filter = "none";
              const blurred = this.bgCtx.getImageData(0, 0, this.width, this.height);

              // Composite: person pixels from frame, background pixels from blurred
              for (let i = 0; i < maskData.length; i++) {
                const isPerson = maskData[i] > 0;
                if (!isPerson) {
                  const pi = i * 4;
                  frame.data[pi] = blurred.data[pi];
                  frame.data[pi + 1] = blurred.data[pi + 1];
                  frame.data[pi + 2] = blurred.data[pi + 2];
                }
              }
            } else if (this.effect.mode === "image") {
              // Draw background image/gradient
              if (this.bgImage) {
                this.bgCtx.drawImage(this.bgImage, 0, 0, this.width, this.height);
              } else if (this.gradientBg) {
                this.bgCtx.fillStyle = this.gradientBg;
                this.bgCtx.fillRect(0, 0, this.width, this.height);
              }
              const bg = this.bgCtx.getImageData(0, 0, this.width, this.height);

              for (let i = 0; i < maskData.length; i++) {
                const isPerson = maskData[i] > 0;
                if (!isPerson) {
                  const pi = i * 4;
                  frame.data[pi] = bg.data[pi];
                  frame.data[pi + 1] = bg.data[pi + 1];
                  frame.data[pi + 2] = bg.data[pi + 2];
                }
              }
            }

            this.ctx.putImageData(frame, 0, 0);
            mask.close();
          }
        } catch {
          // Segmentation failed — draw raw frame
          this.ctx.drawImage(this.videoEl, 0, 0, this.width, this.height);
        }
      } else {
        // No segmenter — simple blur fallback (no person isolation)
        this.ctx.drawImage(this.videoEl, 0, 0, this.width, this.height);
      }
    } else {
      // No effect — draw raw
      this.ctx.drawImage(this.videoEl, 0, 0, this.width, this.height);
    }

    this.animFrame = requestAnimationFrame(this.processFrame);
  };

  /** Stop processing */
  stop() {
    this.running = false;
    cancelAnimationFrame(this.animFrame);
    if (this.outputStream) {
      for (const track of this.outputStream.getTracks()) track.stop();
      this.outputStream = null;
    }
    this.videoEl.srcObject = null;
  }

  /** Check if background processing is active */
  isActive(): boolean {
    return this.running && this.effect.mode !== "none";
  }
}
