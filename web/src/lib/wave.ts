/** Wave — WebRTC peer connection manager */

export type CallState = "idle" | "ringing" | "connecting" | "connected" | "ended";

export interface WaveCallOptions {
  callId: string;
  peerEmail: string;
  isInitiator: boolean;
  video: boolean;
  onStateChange: (state: CallState) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onLocalStream: (stream: MediaStream) => void;
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

  constructor(opts: WaveCallOptions) {
    this.opts = opts;
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
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
      } else if (state === "failed" || state === "closed") {
        this.setState("ended");
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      if (this.pc.iceConnectionState === "disconnected") {
        // Give it a moment to recover before ending
        setTimeout(() => {
          if (this.pc.iceConnectionState === "disconnected" || this.pc.iceConnectionState === "failed") {
            this.setState("ended");
          }
        }, 3000);
      }
    };
  }

  private setState(state: CallState) {
    this.state = state;
    this.opts.onStateChange(state);
  }

  getState(): CallState {
    return this.state;
  }

  async startLocalMedia(video: boolean): Promise<MediaStream> {
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
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
    // Stop all local tracks
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
