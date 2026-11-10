/**
 * YouTube Max - Player Engine (iOS PWA Background Play & Ad-Free Streaming)
 */

// iOS Silent Audio Data URI for keeping background audio session active on Lock Screen
const SILENT_AUDIO = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

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

    this.initEvents();
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
    // playsinline=1 (iOS Safari plays inside page, not forced full native player)
    // enablejsapi=1 (allows js api communication)
    // rel=0 (do not show unrelated external videos)
    // modestbranding=1 (hides big YouTube logo)
    // iv_load_policy=3 (disables video annotations)
    const embedUrl = `https://www.youtube-nocookie.com/embed/${videoData.videoId}?autoplay=1&playsinline=1&enablejsapi=1&rel=0&modestbranding=1&iv_load_policy=3`;

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
    if (this.iframe && this.iframe.contentWindow) {
      this.iframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
    }
    if (this.isAudioMode) {
      this.audioEl.play().catch(() => { });
    }
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    window.updateMiniPlayerState(true);
  }

  pause() {
    this.isPlaying = false;
    if (this.iframe && this.iframe.contentWindow) {
      this.iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
    }
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
