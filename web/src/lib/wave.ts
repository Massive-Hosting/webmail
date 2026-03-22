/** Wave — WebRTC peer connection manager */

export type CallState = "idle" | "ringing" | "connecting" | "connected" | "ended";

export type NetworkQuality = "excellent" | "good" | "fair" | "poor" | "unknown";

export interface WaveCallOptions {
  callId: string;
  peerEmail: string;
  isInitiator: boolean;
  video: boolean;
  iceServers?: RTCIceServer[];
  onStateChange: (state: CallState) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onLocalStream: (stream: MediaStream) => void;
  onNetworkQuality?: (quality: NetworkQuality) => void;
  sendSignal: (to: string, signal: unknown) => void;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export class WaveConnection {
  private pc: RTCPeerConnection;
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private state: CallState = "idle";
  private opts: WaveCallOptions;
  private statsInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private prevBytesReceived = 0;

  constructor(opts: WaveCallOptions) {
    this.opts = opts;
    this.pc = new RTCPeerConnection({ iceServers: opts.iceServers ?? ICE_SERVERS });
    this.setupPeerConnection();
  }

  private setupPeerConnection() {
    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.opts.sendSignal(this.opts.peerEmail, {
          type: "ice-candidate",
          candidate: e.candidate,
        });
      }
    };

    this.pc.ontrack = (e) => {
      if (e.streams[0]) {
        this.opts.onRemoteStream(e.streams[0]);
      }
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;
      if (state === "connected") {
        this.setState("connected");
        this.startNetworkMonitoring();
      } else if (state === "failed") {
        this.attemptReconnect();
      } else if (state === "closed") {
        this.setState("ended");
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      if (this.pc.iceConnectionState === "disconnected") {
        // Give ICE a chance to recover before attempting reconnect
        this.reconnectTimeout = setTimeout(() => {
          if (this.pc.iceConnectionState === "disconnected") {
            this.attemptReconnect();
          } else if (this.pc.iceConnectionState === "failed") {
            this.attemptReconnect();
          }
        }, 3000);
      } else if (this.pc.iceConnectionState === "connected") {
        // Clear any pending reconnect
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = null;
        }
      }
    };
  }

  /** Attempt ICE restart to recover from network changes */
  private async attemptReconnect() {
    if (this.state === "ended") return;
    try {
      const offer = await this.pc.createOffer({ iceRestart: true });
      await this.pc.setLocalDescription(offer);
      this.opts.sendSignal(this.opts.peerEmail, {
        type: "sdp",
        sdp: this.pc.localDescription,
      });
    } catch {
      // Reconnect failed — end the call
      this.setState("ended");
    }
  }

  /** Monitor network quality using RTCPeerConnection stats */
  private startNetworkMonitoring() {
    this.statsInterval = setInterval(async () => {
      if (this.state !== "connected" || !this.opts.onNetworkQuality) return;
      try {
        const stats = await this.pc.getStats();
        let packetLoss = 0;
        let jitter = 0;
        let roundTripTime = 0;
        let hasInbound = false;

        stats.forEach((report) => {
          if (report.type === "inbound-rtp" && report.kind === "video") {
            hasInbound = true;
            const lost = report.packetsLost ?? 0;
            const received = report.packetsReceived ?? 0;
            if (received + lost > 0) {
              packetLoss = (lost / (received + lost)) * 100;
            }
            jitter = (report.jitter ?? 0) * 1000; // convert to ms
          }
          if (report.type === "candidate-pair" && report.state === "succeeded") {
            roundTripTime = report.currentRoundTripTime ? report.currentRoundTripTime * 1000 : 0;
          }
        });

        if (!hasInbound) {
          // Try audio stats
          stats.forEach((report) => {
            if (report.type === "inbound-rtp" && report.kind === "audio") {
              hasInbound = true;
              const lost = report.packetsLost ?? 0;
              const received = report.packetsReceived ?? 0;
              if (received + lost > 0) {
                packetLoss = (lost / (received + lost)) * 100;
              }
            }
          });
        }

        let quality: NetworkQuality = "unknown";
        if (hasInbound) {
          if (packetLoss < 1 && roundTripTime < 100 && jitter < 30) {
            quality = "excellent";
          } else if (packetLoss < 3 && roundTripTime < 200 && jitter < 50) {
            quality = "good";
          } else if (packetLoss < 8 && roundTripTime < 400) {
            quality = "fair";
          } else {
            quality = "poor";
          }
        }
        this.opts.onNetworkQuality(quality);
      } catch {
        // Stats not available
      }
    }, 3000);
  }

  private setState(state: CallState) {
    this.state = state;
    this.opts.onStateChange(state);
    if (state === "ended") {
      if (this.statsInterval) clearInterval(this.statsInterval);
      if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    }
  }

  getState(): CallState {
    return this.state;
  }

  /** Get the underlying RTCPeerConnection (for PiP, stats, etc.) */
  getPeerConnection(): RTCPeerConnection {
    return this.pc;
  }

  async startLocalMedia(video: boolean): Promise<MediaStream> {
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: video ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } : false,
    });

    for (const track of this.localStream.getTracks()) {
      this.pc.addTrack(track, this.localStream);
    }

    this.opts.onLocalStream(this.localStream);
    return this.localStream;
  }

  async createOffer(): Promise<void> {
    this.setState("connecting");
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.opts.sendSignal(this.opts.peerEmail, {
      type: "sdp",
      sdp: this.pc.localDescription,
    });
  }

  async handleOffer(sdp: RTCSessionDescriptionInit): Promise<void> {
    this.setState("connecting");
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.opts.sendSignal(this.opts.peerEmail, {
      type: "sdp",
      sdp: this.pc.localDescription,
    });
  }

  async handleAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
  }

  async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {
      // Non-fatal: some candidates arrive before remote description is set
    }
  }

  async handleSignal(signal: { type: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }): Promise<void> {
    if (signal.type === "sdp" && signal.sdp) {
      if (signal.sdp.type === "offer") {
        await this.handleOffer(signal.sdp);
      } else if (signal.sdp.type === "answer") {
        await this.handleAnswer(signal.sdp);
      }
    } else if (signal.type === "ice-candidate" && signal.candidate) {
      await this.handleIceCandidate(signal.candidate);
    }
  }

  toggleMute(): boolean {
    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      return !audioTrack.enabled; // returns true if now muted
    }
    return false;
  }

  toggleVideo(): boolean {
    if (!this.localStream) return true;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      return !videoTrack.enabled; // returns true if camera is now off
    }
    return true;
  }

  async startScreenShare(): Promise<MediaStream | null> {
    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      const screenTrack = this.screenStream.getVideoTracks()[0];
      const sender = this.pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender && screenTrack) {
        await sender.replaceTrack(screenTrack);
      }

      // When user stops sharing via browser UI
      screenTrack.addEventListener("ended", () => {
        this.stopScreenShare();
      });

      return this.screenStream;
    } catch {
      return null;
    }
  }

  stopScreenShare(): void {
    if (this.screenStream) {
      for (const track of this.screenStream.getTracks()) {
        track.stop();
      }
      this.screenStream = null;

      // Revert to camera
      const cameraTrack = this.localStream?.getVideoTracks()[0];
      const sender = this.pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender && cameraTrack) {
        sender.replaceTrack(cameraTrack).catch(() => {});
      }
    }
  }

  hangup(): void {
    if (this.statsInterval) clearInterval(this.statsInterval);
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop();
      }
      this.localStream = null;
    }
    if (this.screenStream) {
      for (const track of this.screenStream.getTracks()) {
        track.stop();
      }
      this.screenStream = null;
    }

    this.pc.close();
    this.setState("ended");
  }
}
