/**
 * YouTube Max - Player Engine
 * Supports True Screen-Off Audio Playback via Native HTML5 Audio Streaming & MediaSession API
 */

const EMBED_ORIGIN = 'https://www.youtube-nocookie.com';
const TRUSTED_PLAYER_ORIGINS = [EMBED_ORIGIN, 'https://www.youtube.com'];
const YT_STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 };

function formatTime(seconds) {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
  const sec = Math.floor(seconds);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${h}:${remM < 10 ? '0' : ''}${remM}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

class YouTubePlayer {
  constructor() {
    this.playerContainer = document.getElementById('playerContainer');
    this.iframe = document.getElementById('playerIframe');
    this.audioEl = document.getElementById('mainAudio');
    this.audioModeScreen = document.getElementById('audioModeScreen');
    this.audioModeThumb = document.getElementById('audioModeThumb');
    this.audioModeBtn = document.getElementById('toggleAudioModeBtn');
    this.audioModeText = document.getElementById('audioModeText');
    this.audioBadge = document.getElementById('audioModeBadge');
    this.vinylRecord = document.getElementById('vinylRecord');
    this.modal = document.getElementById('watchModal');
    this.closeWatchBtn = document.getElementById('closeWatchBtn');

    // Audio in-player controls
    this.audioScrubber = document.getElementById('audioScrubber');
    this.audioCurrentTime = document.getElementById('audioCurrentTime');
    this.audioDuration = document.getElementById('audioDuration');
    this.audioPlayBtn = document.getElementById('audioPlayBtn');
    this.audioPlayIcon = document.getElementById('audioPlayIcon');
    this.audioRewindBtn = document.getElementById('audioRewindBtn');
    this.audioForwardBtn = document.getElementById('audioForwardBtn');

    this.currentVideoData = null;
    this.isAudioMode = false;
    this.isPlaying = false;
    this.isScrubbing = false;
    this.currentPosition = 0;
    this.videoDuration = 0;
    this.wasAutoSwitched = false;
    this.lastPlayerState = null;
    this.isMuted = true;
    this.unmuteCheckTimer = null;

    this.onNextTrackCallback = null;
    this.onVideoEnded = null;

    this.initEvents();
    this.initAudioEvents();
    this.initEmbedBridge();
    this.initMediaSession();
  }

  initEvents() {
    // Minimize Watch Page
    if (this.closeWatchBtn) {
      this.closeWatchBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.minimizePlayer();
      });
    }

    // Toggle Audio-Only Mode
    if (this.audioModeBtn) {
      this.audioModeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleAudioMode();
      });
    }

    // Handle Phone Screen Off / Lock / App Background
    document.addEventListener('visibilitychange', () => {
      this.handleVisibilityChange();
    }, true);
  }

  initAudioEvents() {
    if (!this.audioEl) return;

    // Track time updates & sync UI & MediaSession
    this.audioEl.addEventListener('timeupdate', () => {
      if (!this.isAudioMode && !this.wasAutoSwitched) return;

      const cur = this.audioEl.currentTime || 0;
      const dur = this.audioEl.duration || this.videoDuration || 0;
      this.currentPosition = cur;

      if (!this.isScrubbing && dur > 0) {
        if (this.audioScrubber) {
          this.audioScrubber.value = ((cur / dur) * 100).toFixed(1);
        }
        if (this.audioCurrentTime) this.audioCurrentTime.textContent = formatTime(cur);
        if (this.audioDuration) this.audioDuration.textContent = formatTime(dur);
      }

      // Update iOS & Android Lock Screen scrubber
      this.updateMediaSessionPosition(cur, dur);

      // Prevent WebKit Natural End Audio Session closure bug on iOS
      if (dur > 0 && (dur - cur) < 0.8 && (dur - cur) > 0) {
        if (this.onVideoEnded && !this._transitionTriggered) {
          this._transitionTriggered = true;
          this.onVideoEnded();
        }
      }
    });

    this.audioEl.addEventListener('play', () => {
      this.isPlaying = true;
      this._transitionTriggered = false;
      this.updatePlayStateUI(true);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
      window.updateMiniPlayerState(true);
    });

    this.audioEl.addEventListener('pause', () => {
      // If we are actively transitioning or scrubbing, ignore temporary pause
      if (this.isAudioMode || this.wasAutoSwitched) {
        this.isPlaying = false;
        this.updatePlayStateUI(false);
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
        window.updateMiniPlayerState(false);
      }
    });

    this.audioEl.addEventListener('ended', () => {
      this.isPlaying = false;
      this.updatePlayStateUI(false);
      if (this.onVideoEnded && !this._transitionTriggered) {
        this._transitionTriggered = true;
        this.onVideoEnded();
      }
    });

    this.audioEl.addEventListener('error', (e) => {
      console.warn('Audio element error:', e);
      if (this.isAudioMode) {
        window.showToast('Audio buffering error. Retrying...');
        setTimeout(() => {
          if (this.isAudioMode && this.currentVideoData) {
            this.audioEl.load();
            this.audioEl.play().catch(() => {});
          }
        }, 1500);
      }
    });

    // Audio Screen Controls Interaction
    if (this.audioPlayBtn) {
      this.audioPlayBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.togglePlay();
      });
    }

    if (this.audioRewindBtn) {
      this.audioRewindBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.seekTo(Math.max(0, (this.audioEl.currentTime || this.currentPosition) - 10));
      });
    }

    if (this.audioForwardBtn) {
      this.audioForwardBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.seekTo((this.audioEl.currentTime || this.currentPosition) + 10);
      });
    }

    if (this.audioScrubber) {
      this.audioScrubber.addEventListener('input', () => {
        this.isScrubbing = true;
        const dur = this.audioEl.duration || this.videoDuration || 0;
        const target = (this.audioScrubber.value / 100) * dur;
        if (this.audioCurrentTime) this.audioCurrentTime.textContent = formatTime(target);
      });

      this.audioScrubber.addEventListener('change', () => {
        const dur = this.audioEl.duration || this.videoDuration || 0;
        const target = (this.audioScrubber.value / 100) * dur;
        this.seekTo(target);
        this.isScrubbing = false;
      });
    }
  }

  updatePlayStateUI(isPlaying) {
    if (this.audioPlayIcon) {
      this.audioPlayIcon.innerHTML = isPlaying
        ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>' // Pause icon
        : '<path d="M8 5v14l11-7z"/>'; // Play icon
    }
    if (this.vinylRecord) {
      this.vinylRecord.style.animationPlayState = isPlaying ? 'running' : 'paused';
    }
    const waveBars = document.querySelector('.audio-wave-bars');
    if (waveBars) {
      waveBars.style.opacity = isPlaying ? '1' : '0.2';
    }
  }

  /**
   * Automatic Screen-Off Background Handoff:
   * When phone screen is locked or tab is hidden, switch playback to native HTML5 audio!
   */
  handleVisibilityChange() {
    let backgroundEnabled = true;
    try {
      const stored = localStorage.getItem('ytmax_bg_audio');
      if (stored === 'off') backgroundEnabled = false;
    } catch (e) {}

    if (document.hidden) {
      // Screen was turned off / locked / app backgrounded
      if (this.isPlaying && !this.isAudioMode && backgroundEnabled) {
        this.wasAutoSwitched = true;
        const resumePos = this.currentPosition || 0;

        // Mute/pause iframe
        this.sendCommand('pauseVideo');

        // Hand off to native audio element
        const streamUrl = `/api/stream?id=${encodeURIComponent(this.currentVideoData.videoId)}`;
        if (this.audioEl.src !== window.location.origin + streamUrl && !this.audioEl.src.includes(streamUrl)) {
          this.audioEl.src = streamUrl;
        }

        this.audioEl.currentTime = resumePos;
        this.audioEl.play().catch((err) => {
          console.warn('Auto background play failed:', err);
        });

        this.updateMediaSessionMetadata();
      } else if (this.isAudioMode && this.isPlaying && this.audioEl.paused) {
        // Keep Audio Mode going
        this.audioEl.play().catch(() => {});
      }
    } else {
      // Screen turned back on / app foregrounded
      if (this.wasAutoSwitched) {
        const syncedPos = this.audioEl.currentTime || this.currentPosition;
        this.wasAutoSwitched = false;

        // Sync iframe back to audio position
        this.currentPosition = syncedPos;
        this.audioEl.pause();
        this.sendCommand('seekTo', [syncedPos, true]);
        this.sendCommand('playVideo');
      }
    }
  }

  /**
   * Two-way bridge with the YouTube embed
   */
  initEmbedBridge() {
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
        if (typeof data.info.currentTime === 'number') {
          this.currentPosition = data.info.currentTime;
        }
        if (typeof data.info.duration === 'number' && data.info.duration > 0) {
          this.videoDuration = data.info.duration;
        }
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
    try {
      this.iframe.contentWindow.postMessage(JSON.stringify(msg), EMBED_ORIGIN);
    } catch (e) {}
  }

  onEmbedReady() {
    if (this.isAudioMode) return;
    this.sendCommand('playVideo');
    this.sendCommand('unMute');
    this.sendCommand('setVolume', [100]);

    clearTimeout(this.unmuteCheckTimer);
    this.unmuteCheckTimer = setTimeout(() => {
      if (this.isMuted && !this.isAudioMode) {
        this.sendCommand('playVideo');
      }
    }, 1200);
  }

  handleStateChange(state) {
    this.lastPlayerState = state;
    if (state === YT_STATE.PLAYING) {
      this.isPlaying = true;
      this._transitionTriggered = false;
      this.updatePlayStateUI(true);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
      window.updateMiniPlayerState(true);
    } else if (state === YT_STATE.PAUSED) {
      if (!this.wasAutoSwitched) {
        this.isPlaying = false;
        this.updatePlayStateUI(false);
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
        window.updateMiniPlayerState(false);
      }
    } else if (state === YT_STATE.ENDED) {
      this.isPlaying = false;
      this.updatePlayStateUI(false);
      if (this.onVideoEnded && !this._transitionTriggered) {
        this._transitionTriggered = true;
        this.onVideoEnded();
      }
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

      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) {
          this.seekTo(details.seekTime);
        }
      });

      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        const step = details.seekOffset || 10;
        this.seekTo(Math.max(0, (this.audioEl.currentTime || this.currentPosition) - step));
      });

      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        const step = details.seekOffset || 10;
        this.seekTo((this.audioEl.currentTime || this.currentPosition) + step);
      });

      navigator.mediaSession.setActionHandler('previoustrack', () => {
        this.seekTo(0);
      });

      navigator.mediaSession.setActionHandler('nexttrack', () => {
        if (this.onNextTrackCallback) this.onNextTrackCallback();
      });
    } catch (e) {
      console.warn('MediaSession handler warning:', e);
    }
  }

  updateMediaSessionMetadata() {
    if (!('mediaSession' in navigator) || !this.currentVideoData) return;

    const data = this.currentVideoData;
    const thumb = data.thumbnail || '/icons/icon-512.png';

    navigator.mediaSession.metadata = new MediaMetadata({
      title: data.title || 'YouTube Video',
      artist: data.author || 'YouTube Max',
      album: 'YouTube Max (Ad-Free Background)',
      artwork: [
        { src: thumb, sizes: '512x512', type: 'image/jpeg' },
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }
      ]
    });
    navigator.mediaSession.playbackState = 'playing';
  }

  updateMediaSessionPosition(position, duration) {
    if (!('mediaSession' in navigator) || !('setPositionState' in navigator.mediaSession)) return;
    if (!isFinite(duration) || duration <= 0 || !isFinite(position) || position < 0) return;

    try {
      navigator.mediaSession.setPositionState({
        duration: Math.max(duration, 1),
        playbackRate: this.audioEl.playbackRate || 1,
        position: Math.min(position, duration)
      });
    } catch (e) {}
  }

  /**
   * Load Video by Data
   */
  loadVideo(videoData) {
    this.currentVideoData = videoData;
    this.isPlaying = true;
    this.currentPosition = 0;
    this._transitionTriggered = false;

    // Check if user set default mode to Audio Only
    let preferAudio = false;
    try {
      const q = localStorage.getItem('ytmax_default_quality');
      if (q === 'audio') preferAudio = true;
    } catch (e) {}

    this.updateMediaSessionMetadata();

    // Prime the audio element in the user-gesture context so iOS allows background play
    const streamUrl = `/api/stream?id=${encodeURIComponent(videoData.videoId)}`;
    this.audioEl.src = streamUrl;
    this.audioEl.currentTime = 0;

    if (this.audioModeThumb && videoData.thumbnail) {
      this.audioModeThumb.src = videoData.thumbnail;
    }

    if (preferAudio || this.isAudioMode) {
      this.activateAudioMode(0);
    } else {
      this.activateVideoMode();
    }

    window.updateMiniPlayerState(true);
  }

  activateAudioMode(startPos = 0, customSrc = null) {
    this.isAudioMode = true;
    this.wasAutoSwitched = false;

    // Stop iframe and any local video element
    this.sendCommand('pauseVideo');
    this.iframe.classList.add('hidden');
    const mainVideo = document.getElementById('mainVideo');
    if (mainVideo) {
      mainVideo.pause();
      mainVideo.classList.add('hidden');
    }

    this.audioModeScreen.classList.remove('hidden');
    if (this.playerContainer) this.playerContainer.classList.add('audio-active');

    if (this.audioModeBtn) {
      this.audioModeBtn.classList.add('active');
    }
    if (this.audioModeText) {
      this.audioModeText.textContent = 'Video Mode';
    }

    const streamUrl = customSrc || `/api/stream?id=${encodeURIComponent(this.currentVideoData.videoId)}`;
    if (this.audioEl.src !== streamUrl && !this.audioEl.src.includes(streamUrl)) {
      this.audioEl.src = streamUrl;
    }

    this.audioEl.currentTime = startPos;
    this.audioEl.play().catch((err) => {
      console.warn('Native audio play error:', err);
    });

    this.updatePlayStateUI(true);
    this.updateMediaSessionMetadata();
    if (!customSrc) {
      window.showToast('🎧 Audio Mode Active (Screen-Off Ready)');
    }
  }

  activateVideoMode() {
    this.isAudioMode = false;
    this.wasAutoSwitched = false;

    // Pause native audio and native video
    this.audioEl.pause();
    const mainVideo = document.getElementById('mainVideo');
    if (mainVideo) {
      mainVideo.pause();
      mainVideo.classList.add('hidden');
    }

    this.audioModeScreen.classList.add('hidden');
    this.iframe.classList.remove('hidden');
    if (this.playerContainer) this.playerContainer.classList.remove('audio-active');

    if (this.audioModeBtn) {
      this.audioModeBtn.classList.remove('active');
    }
    if (this.audioModeText) {
      this.audioModeText.textContent = 'Audio Mode';
    }

    const origin = encodeURIComponent(window.location.origin);
    const embedUrl = `${EMBED_ORIGIN}/embed/${encodeURIComponent(this.currentVideoData.videoId)}?autoplay=1&mute=1&playsinline=1&enablejsapi=1&origin=${origin}&rel=0&modestbranding=1&iv_load_policy=3`;

    this.lastPlayerState = null;
    this.isMuted = true;
    clearTimeout(this.unmuteCheckTimer);
    this.iframe.src = embedUrl;

    this.updatePlayStateUI(true);
  }

  /**
   * Play media directly from local offline storage (Zero Internet)
   */
  playOfflineMedia(downloadItem) {
    this.currentVideoData = downloadItem;
    this.isPlaying = true;
    this.currentPosition = 0;
    this._transitionTriggered = false;

    if (this._currentBlobUrl) {
      try { URL.revokeObjectURL(this._currentBlobUrl); } catch (e) {}
    }
    const blobUrl = URL.createObjectURL(downloadItem.blob);
    this._currentBlobUrl = blobUrl;

    this.updateMediaSessionMetadata();

    const mainVideo = document.getElementById('mainVideo');

    if (downloadItem.type === 'video') {
      // Offline Video Playback
      this.isAudioMode = false;
      this.iframe.classList.add('hidden');
      this.iframe.src = '';
      this.audioModeScreen.classList.add('hidden');
      if (this.playerContainer) this.playerContainer.classList.remove('audio-active');

      if (mainVideo) {
        mainVideo.src = blobUrl;
        mainVideo.classList.remove('hidden');
        mainVideo.controls = true;
        mainVideo.play().catch(e => console.warn(e));
      }
      this.audioEl.pause();
    } else {
      // Offline Audio Playback
      if (mainVideo) {
        mainVideo.pause();
        mainVideo.classList.add('hidden');
      }
      if (this.audioModeThumb && downloadItem.thumbnail) {
        this.audioModeThumb.src = downloadItem.thumbnail;
      }
      this.activateAudioMode(0, blobUrl);
    }

    window.updateMiniPlayerState(true);
    window.showToast('📶 Playing from Offline Storage (Zero Internet)');
  }

  toggleAudioMode() {
    if (!this.currentVideoData) return;

    if (this.isAudioMode) {
      // Switch to Video Mode
      const currentPos = this.audioEl.currentTime || this.currentPosition;
      this.activateVideoMode();
      this.sendCommand('seekTo', [currentPos, true]);
      window.showToast('🎬 Video Mode Active');
    } else {
      // Switch to Audio Mode
      const currentPos = this.currentPosition || 0;
      this.activateAudioMode(currentPos);
    }
  }

  seekTo(seconds) {
    const s = Math.max(0, seconds);
    this.currentPosition = s;

    if (this.isAudioMode || this.wasAutoSwitched) {
      if (this.audioEl) {
        this.audioEl.currentTime = s;
        if (this.audioEl.paused && this.isPlaying) {
          this.audioEl.play().catch(() => {});
        }
      }
    } else {
      this.sendCommand('seekTo', [s, true]);
      if (this.audioEl) this.audioEl.currentTime = s;
    }

    if (this.audioCurrentTime) this.audioCurrentTime.textContent = formatTime(s);
  }

  play() {
    this.isPlaying = true;
    if (this.isAudioMode || this.wasAutoSwitched) {
      this.audioEl.play().catch(() => {});
    } else {
      this.sendCommand('playVideo');
    }
    this.updatePlayStateUI(true);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    window.updateMiniPlayerState(true);
  }

  pause() {
    this.isPlaying = false;
    this.sendCommand('pauseVideo');
    this.audioEl.pause();
    this.updatePlayStateUI(false);
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
