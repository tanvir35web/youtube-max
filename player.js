/**
 * YouTube Max - Player Engine (iOS PWA Background Play & Ad-Free Streaming)
 */

// iOS Silent Audio Data URI for keeping background audio session active on Lock Screen
const SILENT_AUDIO = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

// Origins the embed is served from; messages from anywhere else are ignored.
const EMBED_ORIGIN = 'https://www.youtube-nocookie.com';
const TRUSTED_PLAYER_ORIGINS = [EMBED_ORIGIN, 'https://www.youtube.com'];

// YouTube player states reported over postMessage
const YT_STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2 };

class YouTubePlayer {
  constructor() {
    this.iframe = document.getElementById('playerIframe');
    this.audioEl = document.getElementById('mainAudio');
    this.audioModeScreen = document.getElementById('audioModeScreen');
    this.audioModeThumb = document.getElementById('audioModeThumb');
    this.audioModeBtn = document.getElementById('toggleAudioModeBtn');
    this.audioModeText = document.getElementById('audioModeText');
    this.modal = document.getElementById('watchModal');
    this.closeWatchBtn = document.getElementById('closeWatchBtn');

    this.currentVideoData = null;
    this.isAudioMode = false;
    this.isPlaying = false;
    this.onNextTrackCallback = null;
    this.onVideoEnded = null;
    this.lastPlayerState = null;
    this.isMuted = true;
    this.unmuteCheckTimer = null;

    this.initEvents();
    this.initEmbedBridge();
    this.initMediaSession();
  }

  initEvents() {
    // Minimize Watch Page
    this.closeWatchBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.minimizePlayer();
    });

    // Toggle Audio-Only Mode (Screen-Off Friendly)
    this.audioModeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleAudioMode();
    });

    // Prevent iOS Safari from killing playback on screen lock
    document.addEventListener('visibilitychange', (e) => {
      e.stopImmediatePropagation();
      if (this.isPlaying && this.isAudioMode && this.audioEl.paused) {
        this.audioEl.play().catch(() => { });
      }
    }, true);
  }

  /**
   * Two-way bridge with the YouTube embed (the same postMessage protocol the
   * official IFrame API uses). Lets us detect when the video is ready,
   * playing or finished.
   */
  initEmbedBridge() {
    // Once the iframe loads, ask it to start sending events to us.
    this.iframe.addEventListener('load', () => {
      if (!this.iframe.src) return;
      this.sendCommand(null, null, 'listening');
    });

    window.addEventListener('message', (e) => {
      if (!TRUSTED_PLAYER_ORIGINS.includes(e.origin)) return;
      if (e.source !== this.iframe.contentWindow) return;

      let data;
      try {
        data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      } catch (err) {
        return;
      }
      if (!data || typeof data !== 'object') return;

      if (data.event === 'onReady') {
        this.onEmbedReady();
      }

      let state = null;
      if (data.event === 'onStateChange') state = data.info;
      if (data.event === 'infoDelivery' && data.info) {
        if (typeof data.info.muted === 'boolean') this.isMuted = data.info.muted;
        if (typeof data.info.playerState === 'number') state = data.info.playerState;
      }
      if (typeof state === 'number' && state !== this.lastPlayerState) {
        this.handleStateChange(state);
      }
    });
  }

  sendCommand(func, args, event) {
    if (!this.iframe || !this.iframe.contentWindow) return;
    const msg = event
      ? { event, id: 'ytmax-player', channel: 'widget' }
      : { event: 'command', func, args: args || [] };
    this.iframe.contentWindow.postMessage(JSON.stringify(msg), EMBED_ORIGIN);
  }

  onEmbedReady() {
    // Video starts muted (the only autoplay iOS allows); try turning sound on.
    this.sendCommand('playVideo');
    this.sendCommand('unMute');
    this.sendCommand('setVolume', [100]);

    clearTimeout(this.unmuteCheckTimer);
    this.unmuteCheckTimer = setTimeout(() => {
      if (this.isMuted) {
        // iOS blocked the unmute; make sure the video keeps playing silently.
        this.sendCommand('playVideo');
        window.showToast('🔇 Tap the video to turn on sound');
      }
    }, 1500);
  }

  handleStateChange(state) {
    this.lastPlayerState = state;
    if (state === YT_STATE.PLAYING) {
      this.isPlaying = true;
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
      window.updateMiniPlayerState(true);
    } else if (state === YT_STATE.PAUSED) {
      this.isPlaying = false;
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
      window.updateMiniPlayerState(false);
    } else if (state === YT_STATE.ENDED) {
      this.isPlaying = false;
      if (this.onVideoEnded) this.onVideoEnded();
    }
  }

  initMediaSession() {
    if (!('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.setActionHandler('play', () => {
        this.play();
      });

      navigator.mediaSession.setActionHandler('pause', () => {
        this.pause();
      });

      navigator.mediaSession.setActionHandler('previoustrack', () => {
        if (this.audioEl.currentTime) this.audioEl.currentTime = Math.max(0, this.audioEl.currentTime - 15);
      });

      navigator.mediaSession.setActionHandler('nexttrack', () => {
        if (this.onNextTrackCallback) this.onNextTrackCallback();
      });
    } catch (e) {
      console.warn('MediaSession handler error:', e);
    }
  }

  updateMediaSessionMetadata() {
    if (!('mediaSession' in navigator) || !this.currentVideoData) return;

    const data = this.currentVideoData;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: data.title || 'YouTube Video',
      artist: data.author || 'YouTube Max',
      album: 'YouTube Max (Ad-Free)',
      artwork: [
        {
          src: data.thumbnail || '/icons/icon-512.png',
          sizes: '512x512',
          type: 'image/jpeg'
        }
      ]
    });
    navigator.mediaSession.playbackState = 'playing';
  }

  /**
   * Load Video by ID
   */
  loadVideo(videoData) {
    this.currentVideoData = videoData;
    this.isPlaying = true;

    // Set lock screen info for iOS
    this.updateMediaSessionMetadata();

    // Activate background audio session for iOS Lock Screen & Control Center
    try {
      this.audioEl.src = SILENT_AUDIO;
      this.audioEl.loop = true;
      this.audioEl.play().catch(() => {});
    } catch(e) {}

    // Load clean YouTube Embed with zero cookies and inline iOS playback
    // Parameter list:
    // autoplay=1 (auto play)
    // mute=1 (iOS only allows autoplay for muted video; sound is turned on in onEmbedReady)
    // playsinline=1 (iOS Safari plays inside page, not forced full native player)
    // enablejsapi=1 + origin (allows js api communication with this page)
    // rel=0 (do not show unrelated external videos)
    // modestbranding=1 (hides big YouTube logo)
    // iv_load_policy=3 (disables video annotations)
    const origin = encodeURIComponent(window.location.origin);
    const embedUrl = `${EMBED_ORIGIN}/embed/${encodeURIComponent(videoData.videoId)}?autoplay=1&mute=1&playsinline=1&enablejsapi=1&origin=${origin}&rel=0&modestbranding=1&iv_load_policy=3`;

    this.lastPlayerState = null;
    this.isMuted = true;
    clearTimeout(this.unmuteCheckTimer);
    this.iframe.src = embedUrl;
    this.iframe.classList.remove('hidden');
    this.audioModeScreen.classList.add('hidden');
    this.isAudioMode = false;
    this.audioModeBtn.classList.remove('active');
    this.audioModeText.textContent = 'Audio Mode';

    window.updateMiniPlayerState(true);
  }

  toggleAudioMode() {
    this.isAudioMode = !this.isAudioMode;

    if (this.isAudioMode) {
      // Audio-Only Screen-Off Mode
      this.audioModeScreen.classList.remove('hidden');
      this.iframe.classList.add('hidden');
      this.audioModeBtn.classList.add('active');
      this.audioModeText.textContent = 'Video Mode';

      if (this.currentVideoData?.thumbnail) {
        this.audioModeThumb.src = this.currentVideoData.thumbnail;
      }

      // Activate audio element for lock-screen persistence
      this.updateMediaSessionMetadata();
      window.showToast('🎧 Audio Mode On (Lock Screen Ready)');
    } else {
      // Video Mode
      this.audioModeScreen.classList.add('hidden');
      this.iframe.classList.remove('hidden');
      this.audioModeBtn.classList.remove('active');
      this.audioModeText.textContent = 'Audio Mode';
      window.showToast('🎬 Video Mode On');
    }
  }

  play() {
    this.isPlaying = true;
    this.sendCommand('playVideo');
    if (this.isAudioMode) {
      this.audioEl.play().catch(() => { });
    }
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    window.updateMiniPlayerState(true);
  }

  pause() {
    this.isPlaying = false;
    this.sendCommand('pauseVideo');
    this.audioEl.pause();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    window.updateMiniPlayerState(false);
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  minimizePlayer() {
    this.modal.classList.add('hidden');
    window.showMiniPlayer(this.currentVideoData, this.isPlaying);
  }

  restorePlayer() {
    this.modal.classList.remove('hidden');
    window.hideMiniPlayer();
  }
}

window.YouTubePlayer = YouTubePlayer;
