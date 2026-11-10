/**
 * YouTube Max - Player Engine
 * Supports True Screen-Off Audio Playback via Native HTML5 Audio Streaming & MediaSession API
 */

const EMBED_ORIGIN = 'https://www.youtube-nocookie.com';
const TRUSTED_PLAYER_ORIGINS = [EMBED_ORIGIN, 'https://www.youtube.com', 'http://localhost'];
const YT_STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };

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
    this.mainVideo = document.getElementById('mainVideo');
    this.audioEl = document.getElementById('mainAudio');
    this.audioModeScreen = document.getElementById('audioModeScreen');
    this.audioModeThumb = document.getElementById('audioModeThumb');
    this.audioModeBtn = document.getElementById('toggleAudioModeBtn');
    this.audioModeText = document.getElementById('audioModeText');
    this.audioBadge = document.getElementById('audioModeBadge');
    this.vinylRecord = document.getElementById('vinylRecord');
    this.modal = document.getElementById('watchModal');
    this.closeWatchBtn = document.getElementById('closeWatchBtn');

    // Dedicated Play/Pause Button on Watch Page
    this.videoPlayPauseBtn = document.getElementById('videoPlayPauseBtn');
    this.videoPlayPauseIcon = document.getElementById('videoPlayPauseIcon');
    this.videoPlayPauseText = document.getElementById('videoPlayPauseText');

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
    this.isMuted = false;
    this.unmuteCheckTimer = null;
    this._currentBlobUrl = null;

    // Picture-in-Picture: the YouTube iframe is cross-origin and cannot enter PiP,
    // so PiP plays the same video through our own <video> element (muxed MP4 stream).
    this.pipBtn = document.getElementById('pipBtn');
    this.pipBtnText = document.getElementById('pipBtnText');
    this.nativeStreamActive = false;
    this.autoSwitchedFromNative = false;

    this.onNextTrackCallback = null;
    this.onVideoEnded = null;

    this.initEvents();
    this.initAudioEvents();
    this.initNativeVideoEvents();
    this.initPictureInPicture();
    this.initEmbedBridge();
    this.initMediaSession();
  }

  /* ------------------------------------------------------------------------
     Picture-in-Picture
     ------------------------------------------------------------------------ */
  initPictureInPicture() {
    const v = this.mainVideo;
    this.pipSupported = !!v && (
      (document.pictureInPictureEnabled && typeof v.requestPictureInPicture === 'function') ||
      (typeof v.webkitSupportsPresentationMode === 'function' &&
        v.webkitSupportsPresentationMode('picture-in-picture'))
    );

    if (this.pipBtn) {
      if (!this.pipSupported) this.pipBtn.classList.add('hidden');
      this.pipBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.togglePictureInPicture();
      });
    }

    if (!v) return;
    v.addEventListener('enterpictureinpicture', () => this.onPipChange(true));
    v.addEventListener('leavepictureinpicture', () => this.onPipChange(false));
    v.addEventListener('webkitpresentationmodechanged', () => {
      this.onPipChange(v.webkitPresentationMode === 'picture-in-picture');
    });

    // Keep position / lock-screen scrubber in sync while the native element plays
    v.addEventListener('timeupdate', () => {
      if (v.classList.contains('hidden')) return;
      this.currentPosition = v.currentTime || 0;
      if (v.duration && isFinite(v.duration)) {
        this.videoDuration = v.duration;
        this.updateMediaSessionPosition(v.currentTime, v.duration);
      }
    });

    v.addEventListener('error', () => {
      if (this.nativeStreamActive && !this._pipRequestPending) {
        window.showToast('Video stream failed. Switching back to the normal player.');
        this.activateVideoMode(this.currentPosition);
      }
    });
  }

  isInPictureInPicture() {
    const v = this.mainVideo;
    return !!v && (document.pictureInPictureElement === v || v.webkitPresentationMode === 'picture-in-picture');
  }

  isNativeVideoVisible() {
    const v = this.mainVideo;
    return !!v && !v.classList.contains('hidden') && !!v.getAttribute('src');
  }

  getCurrentTime() {
    if (this.isAudioMode || this.wasAutoSwitched) return (this.audioEl && this.audioEl.currentTime) || this.currentPosition;
    if (this.isNativeVideoVisible()) return this.mainVideo.currentTime || this.currentPosition;
    return this.currentPosition;
  }

  onPipChange(active) {
    this.isPipActive = active;
    if (this.pipBtn) this.pipBtn.classList.toggle('active', active);
    if (this.pipBtnText) this.pipBtnText.textContent = active ? 'Exit PiP' : 'PiP';
    if (this.playerContainer) this.playerContainer.classList.toggle('pip-active', active);
  }

  waitForMetadata(timeoutMs = 15000) {
    const v = this.mainVideo;
    if (v.readyState >= 1) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const done = (fn, arg) => {
        clearTimeout(timer);
        v.removeEventListener('loadedmetadata', onMeta);
        v.removeEventListener('error', onErr);
        fn(arg);
      };
      const onMeta = () => done(resolve);
      const onErr = () => done(reject, new Error('Video stream failed to load'));
      const timer = setTimeout(() => done(reject, new Error('Video stream timed out')), timeoutMs);
      v.addEventListener('loadedmetadata', onMeta);
      v.addEventListener('error', onErr);
    });
  }

  requestPictureInPicture() {
    const v = this.mainVideo;
    if (document.pictureInPictureEnabled && typeof v.requestPictureInPicture === 'function') {
      return v.requestPictureInPicture();
    }
    if (typeof v.webkitSetPresentationMode === 'function') {
      v.webkitSetPresentationMode('picture-in-picture');
      return Promise.resolve();
    }
    return Promise.reject(new Error('Picture-in-Picture is not supported'));
  }

  async exitPictureInPicture() {
    const v = this.mainVideo;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (v && typeof v.webkitSetPresentationMode === 'function') {
        v.webkitSetPresentationMode('inline');
      }
    } catch (e) {
      console.warn('Exit PiP failed:', e);
    }
  }

  async togglePictureInPicture() {
    if (!this.currentVideoData || !this.mainVideo) return;
    if (!this.pipSupported) {
      window.showToast('Picture-in-Picture is not supported on this browser');
      return;
    }
    if (this.isInPictureInPicture()) {
      await this.exitPictureInPicture();
      return;
    }

    // Offline video already plays in the native element; otherwise switch to the stream
    if (!this.isNativeVideoVisible()) {
      this.activateNativeStream(this.getCurrentTime());
    }

    const firstTry = this.mainVideo.readyState >= 1;
    this._pipRequestPending = true;
    try {
      // Requesting synchronously keeps the user-gesture; only wait if the stream has no metadata yet
      if (!firstTry) {
        window.showToast('Preparing Picture-in-Picture...');
        await this.waitForMetadata();
      }
      await this.requestPictureInPicture();
    } catch (err) {
      console.warn('PiP request failed:', err);
      if (this.mainVideo.error || /failed|timed out/i.test(err.message || '')) {
        window.showToast('Could not load the video stream for PiP');
        this.activateVideoMode(this.currentPosition);
      } else {
        // Most often the browser dropped the user gesture while the stream loaded
        window.showToast('Video ready. Tap PiP again to pop it out.');
      }
    } finally {
      this._pipRequestPending = false;
    }
  }

  /**
   * Play the current video through the native <video> element (needed for PiP).
   * The iframe keeps its src (paused + hidden) so switching back is instant.
   */
  activateNativeStream(startPos = 0) {
    const v = this.mainVideo;
    if (!v || !this.currentVideoData) return;

    this.isAudioMode = false;
    this.wasAutoSwitched = false;
    this.nativeStreamActive = true;

    this.sendCommand('pauseVideo');
    this.iframe.classList.add('hidden');
    if (this.audioEl) this.audioEl.pause();
    this.audioModeScreen.classList.add('hidden');
    if (this.playerContainer) this.playerContainer.classList.remove('audio-active');
    if (this.audioModeBtn) this.audioModeBtn.classList.remove('active');
    if (this.audioModeText) this.audioModeText.textContent = 'Audio Mode';

    const src = `/api/stream?id=${encodeURIComponent(this.currentVideoData.videoId)}&type=video`;
    if (v.getAttribute('src') !== src) {
      v.src = src;
    }
    if (this.currentVideoData.thumbnail) v.poster = this.currentVideoData.thumbnail;
    v.controls = true;
    v.classList.remove('hidden');

    if (startPos > 0) {
      if (v.readyState >= 1) {
        try { v.currentTime = startPos; } catch (e) {}
      } else {
        v.addEventListener('loadedmetadata', () => {
          try { v.currentTime = startPos; } catch (e) {}
        }, { once: true });
      }
    }

    v.play().catch((err) => console.warn('Native video play error:', err));
    this.updatePlayStateUI(true);
    this.updateMediaSessionMetadata();
  }

  // Stop the native stream (not offline blobs, those are managed by playOfflineMedia)
  stopNativeStream() {
    const v = this.mainVideo;
    if (!v) return;
    v.pause();
    v.classList.add('hidden');
    if (this.nativeStreamActive) {
      v.removeAttribute('src');
      v.removeAttribute('poster');
      try { v.load(); } catch (e) {}
    }
    this.nativeStreamActive = false;
  }

  initEvents() {
    // Minimize Watch Page
    if (this.closeWatchBtn) {
      this.closeWatchBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.minimizePlayer();
      });
    }

    // Desktop Watch Page Close & PiP Buttons
    const closeWatchDesktopBtn = document.getElementById('closeWatchDesktopBtn');
    if (closeWatchDesktopBtn) {
      closeWatchDesktopBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.minimizePlayer();
      });
    }

    const minimizeToPipBtn = document.getElementById('minimizeToPipBtn');
    if (minimizeToPipBtn) {
      minimizeToPipBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.minimizePlayer();
      });
    }

    // Dedicated Play/Pause button on watch page
    if (this.videoPlayPauseBtn) {
      this.videoPlayPauseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.togglePlay();
      });
    }

    // Toggle Audio-Only Mode
    if (this.audioModeBtn) {
      this.audioModeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleAudioMode();
      });
    }

    // Keyboard Spacebar shortcut for desktop
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        if (this.currentVideoData && !this.modal.classList.contains('hidden')) {
          e.preventDefault();
          this.togglePlay();
        }
      }
    });

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
      if (this.isAudioMode || this.wasAutoSwitched) {
        this.isPlaying = true;
        this._transitionTriggered = false;
        this.updatePlayStateUI(true);
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
      }
    });

    this.audioEl.addEventListener('pause', () => {
      if (this.isAudioMode || this.wasAutoSwitched) {
        this.isPlaying = false;
        this.updatePlayStateUI(false);
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
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
      console.warn('Native audio error:', e);
      if (this.isAudioMode && this.currentVideoData) {
        window.showToast('Audio buffering... re-syncing stream');
        setTimeout(() => {
          if (this.isAudioMode && this.currentVideoData) {
            this.audioEl.load();
            this.audioEl.play().catch(() => {});
          }
        }, 1200);
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

  initNativeVideoEvents() {
    if (!this.mainVideo) return;

    this.mainVideo.addEventListener('play', () => {
      this.isPlaying = true;
      this.updatePlayStateUI(true);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    });

    this.mainVideo.addEventListener('pause', () => {
      // Paused on purpose for the background audio handoff: playback continues in audio
      if (this.wasAutoSwitched) return;
      if (!this.mainVideo.classList.contains('hidden')) {
        this.isPlaying = false;
        this.updatePlayStateUI(false);
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
      }
    });

    this.mainVideo.addEventListener('ended', () => {
      this.isPlaying = false;
      this.updatePlayStateUI(false);
      if (this.onVideoEnded) this.onVideoEnded();
    });
  }

  updatePlayStateUI(isPlaying) {
    this.isPlaying = isPlaying;

    // 1. Audio Screen Play/Pause icon
    if (this.audioPlayIcon) {
      this.audioPlayIcon.innerHTML = isPlaying
        ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'
        : '<path d="M8 5v14l11-7z"/>';
    }

    // 2. Watch Page dedicated Play/Pause button
    if (this.videoPlayPauseBtn && this.videoPlayPauseIcon && this.videoPlayPauseText) {
      if (isPlaying) {
        this.videoPlayPauseIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
        this.videoPlayPauseText.textContent = 'Pause';
        this.videoPlayPauseBtn.classList.remove('paused');
      } else {
        this.videoPlayPauseIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
        this.videoPlayPauseText.textContent = 'Play';
        this.videoPlayPauseBtn.classList.add('paused');
      }
    }

    // 3. Vinyl animation and wave equalizer
    if (this.vinylRecord) {
      this.vinylRecord.style.animationPlayState = isPlaying ? 'running' : 'paused';
    }
    const waveBars = document.querySelector('.audio-wave-bars');
    if (waveBars) {
      waveBars.style.opacity = isPlaying ? '1' : '0.2';
    }

    // 4. Mini Player
    if (typeof window.updateMiniPlayerState === 'function') {
      window.updateMiniPlayerState(isPlaying);
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
      // The floating PiP window must keep playing the video itself
      if (this.isInPictureInPicture()) return;

      // Screen was turned off / locked / app backgrounded
      if (this.isPlaying && !this.isAudioMode && backgroundEnabled && this.currentVideoData) {
        const fromNative = this.isNativeVideoVisible();
        const resumePos = fromNative ? (this.mainVideo.currentTime || 0) : (this.currentPosition || 0);
        this.wasAutoSwitched = true;
        this.autoSwitchedFromNative = fromNative;

        // Pause the visible video source
        if (fromNative) this.mainVideo.pause();
        else this.sendCommand('pauseVideo');

        // Hand off to native audio element
        const streamUrl = `/api/stream?id=${encodeURIComponent(this.currentVideoData.videoId)}&type=audio`;
        this.audioEl.muted = false;
        this.audioEl.volume = 1.0;

        if (this.audioEl.src !== window.location.origin + streamUrl && !this.audioEl.src.includes(streamUrl)) {
          this.audioEl.src = streamUrl;
        }

        if (resumePos > 0) {
          if (this.audioEl.readyState >= 1) {
            this.audioEl.currentTime = resumePos;
          } else {
            const onMeta = () => {
              try { this.audioEl.currentTime = resumePos; } catch (e) {}
            };
            this.audioEl.addEventListener('loadedmetadata', onMeta, { once: true });
          }
        }

        this.audioEl.play().catch((err) => {
          console.warn('Auto background audio play failed:', err);
        });

        this.updateMediaSessionMetadata();
      } else if (this.isAudioMode && this.isPlaying && this.audioEl.paused) {
        // Keep Audio Mode going
        this.audioEl.muted = false;
        this.audioEl.play().catch(() => {});
      }
    } else {
      // Screen turned back on / app foregrounded
      if (this.wasAutoSwitched) {
        const syncedPos = this.audioEl.currentTime || this.currentPosition;
        this.wasAutoSwitched = false;
        this.currentPosition = syncedPos;
        this.audioEl.pause();

        if (this.autoSwitchedFromNative && this.isNativeVideoVisible()) {
          // Resume the native video (PiP stream / offline file) where audio left off
          this.autoSwitchedFromNative = false;
          try { this.mainVideo.currentTime = syncedPos; } catch (e) {}
          this.mainVideo.play().catch(() => {});
          return;
        }
        this.autoSwitchedFromNative = false;

        // Sync iframe back to audio position
        this.sendCommand('seekTo', [syncedPos, true]);
        this.sendCommand('unMute');
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
      try {
        this.iframe.contentWindow.postMessage(JSON.stringify({ event: 'listening' }), '*');
      } catch (e) {}
    });

    window.addEventListener('message', (e) => {
      if (!e.origin || (!e.origin.includes('youtube') && !e.origin.includes('localhost'))) return;
      if (e.source !== this.iframe.contentWindow) return;

      let data;
      try {
        data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      } catch (err) {
        return;
      }
      if (!data || typeof data !== 'object') return;

      // While the native <video> (PiP stream / offline file) is playing, the hidden iframe is
      // paused on purpose; its state/time reports must not override the real player state
      if (this.isNativeVideoVisible()) return;

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
      ? { event, id: 1, channel: 'widget' }
      : { event: 'command', func, args: args || [] };
    try {
      this.iframe.contentWindow.postMessage(JSON.stringify(msg), '*');
    } catch (e) {}
  }

  onEmbedReady() {
    if (this.isAudioMode) return;
    this.sendCommand('unMute');
    this.sendCommand('setVolume', [100]);
    this.sendCommand('playVideo');

    clearTimeout(this.unmuteCheckTimer);
    this.unmuteCheckTimer = setTimeout(() => {
      if (!this.isAudioMode) {
        this.sendCommand('unMute');
      }
    }, 1000);
  }

  handleStateChange(state) {
    this.lastPlayerState = state;
    if (state === YT_STATE.PLAYING) {
      this.isPlaying = true;
      this._transitionTriggered = false;
      this.updatePlayStateUI(true);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    } else if (state === YT_STATE.PAUSED) {
      if (!this.wasAutoSwitched) {
        this.isPlaying = false;
        this.updatePlayStateUI(false);
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
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
        this.seekTo(Math.max(0, this.getCurrentTime() - step));
      });

      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        const step = details.seekOffset || 10;
        this.seekTo(this.getCurrentTime() + step);
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

    if (this.audioModeThumb && videoData.thumbnail) {
      this.audioModeThumb.src = videoData.thumbnail;
    }

    // Already floating in PiP (e.g. autoplay next): keep the PiP window and swap the stream
    if (this.isInPictureInPicture()) {
      this.activateNativeStream(0);
      this.updatePlayStateUI(true);
      return;
    }

    if (preferAudio || this.isAudioMode) {
      this.activateAudioMode(0);
    } else {
      this.activateVideoMode();
    }

    this.updatePlayStateUI(true);
  }

  activateAudioMode(startPos = 0, customSrc = null) {
    this.isAudioMode = true;
    this.wasAutoSwitched = false;

    // Stop iframe and any local video element
    this.sendCommand('pauseVideo');
    this.iframe.classList.add('hidden');
    if (this.isInPictureInPicture()) this.exitPictureInPicture();
    this.stopNativeStream();

    this.audioModeScreen.classList.remove('hidden');
    if (this.playerContainer) this.playerContainer.classList.add('audio-active');

    if (this.audioModeBtn) {
      this.audioModeBtn.classList.add('active');
    }
    if (this.audioModeText) {
      this.audioModeText.textContent = 'Video Mode';
    }

    const streamUrl = customSrc || `/api/stream?id=${encodeURIComponent(this.currentVideoData.videoId)}&type=audio`;

    if (this.audioEl) {
      this.audioEl.muted = false;
      this.audioEl.volume = 1.0;

      if (this.audioEl.src !== window.location.origin + streamUrl && !this.audioEl.src.includes(streamUrl)) {
        this.audioEl.src = streamUrl;
      }

      if (startPos > 0) {
        if (this.audioEl.readyState >= 1) {
          this.audioEl.currentTime = startPos;
        } else {
          const onMeta = () => {
            try { this.audioEl.currentTime = startPos; } catch (e) {}
          };
          this.audioEl.addEventListener('loadedmetadata', onMeta, { once: true });
        }
      }

      this.audioEl.play().catch((err) => {
        console.warn('Native audio play error:', err);
      });
    }

    this.updatePlayStateUI(true);
    this.updateMediaSessionMetadata();
    if (!customSrc) {
      window.showToast('🎧 Audio Mode Active (Screen-Off Ready)');
    }
  }

  activateVideoMode(resumePos = null) {
    this.isAudioMode = false;
    this.wasAutoSwitched = false;

    // Pause native audio and native video
    if (this.audioEl) {
      this.audioEl.pause();
    }
    if (this.isInPictureInPicture()) this.exitPictureInPicture();
    this.stopNativeStream();

    this.audioModeScreen.classList.add('hidden');
    this.iframe.classList.remove('hidden');
    if (this.playerContainer) this.playerContainer.classList.remove('audio-active');

    if (this.audioModeBtn) {
      this.audioModeBtn.classList.remove('active');
    }
    if (this.audioModeText) {
      this.audioModeText.textContent = 'Audio Mode';
    }

    const targetPos = resumePos !== null ? resumePos : (this.audioEl ? this.audioEl.currentTime : this.currentPosition);
    const videoId = this.currentVideoData.videoId;

    // Check if iframe already has this video loaded
    const currentSrc = this.iframe.src || '';
    if (currentSrc.includes(`/embed/${videoId}`)) {
      if (targetPos > 0) {
        this.sendCommand('seekTo', [targetPos, true]);
      }
      this.sendCommand('unMute');
      this.sendCommand('playVideo');
    } else {
      const origin = encodeURIComponent(window.location.origin);
      const embedUrl = `${EMBED_ORIGIN}/embed/${encodeURIComponent(videoId)}?autoplay=1&mute=1&playsinline=1&enablejsapi=1&origin=${origin}&rel=0&modestbranding=1&iv_load_policy=3${targetPos > 0 ? `&start=${Math.floor(targetPos)}` : ''}`;

      this.lastPlayerState = null;
      this.isMuted = true;
      clearTimeout(this.unmuteCheckTimer);
      this.iframe.src = embedUrl;
    }

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

    if (downloadItem.type === 'video') {
      // Offline Video Playback
      this.isAudioMode = false;
      this.iframe.classList.add('hidden');
      this.iframe.src = '';
      this.audioModeScreen.classList.add('hidden');
      if (this.playerContainer) this.playerContainer.classList.remove('audio-active');

      if (this.mainVideo) {
        this.nativeStreamActive = false; // blob, not the network stream
        this.mainVideo.removeAttribute('poster');
        this.mainVideo.src = blobUrl;
        this.mainVideo.classList.remove('hidden');
        this.mainVideo.controls = true;
        this.mainVideo.play().catch(e => console.warn(e));
      }
      if (this.audioEl) this.audioEl.pause();
    } else {
      // Offline Audio Playback
      if (this.mainVideo) {
        this.mainVideo.pause();
        this.mainVideo.classList.add('hidden');
      }
      if (this.audioModeThumb && downloadItem.thumbnail) {
        this.audioModeThumb.src = downloadItem.thumbnail;
      }
      this.activateAudioMode(0, blobUrl);
    }

    this.updatePlayStateUI(true);
    window.showToast('📶 Playing from Offline Storage (Zero Internet)');
  }

  toggleAudioMode() {
    if (!this.currentVideoData) return;

    if (this.isAudioMode) {
      // Switch to Video Mode
      const currentPos = (this.audioEl ? this.audioEl.currentTime : 0) || this.currentPosition;
      this.activateVideoMode(currentPos);
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
      if (this.mainVideo && !this.mainVideo.classList.contains('hidden')) {
        this.mainVideo.currentTime = s;
      } else {
        this.sendCommand('seekTo', [s, true]);
      }
    }

    if (this.audioCurrentTime) this.audioCurrentTime.textContent = formatTime(s);
  }

  play() {
    this.isPlaying = true;

    // Native <video> (offline file or PiP stream): play it and leave the hidden iframe alone,
    // otherwise both would play at once
    if (this.isNativeVideoVisible() && !this.wasAutoSwitched) {
      this.mainVideo.play().catch(() => {});
    } else if (this.isAudioMode || this.wasAutoSwitched) {
      if (this.audioEl) {
        this.audioEl.muted = false;
        this.audioEl.play().catch((err) => console.warn('Audio play error:', err));
      }
    } else {
      this.sendCommand('unMute');
      this.sendCommand('playVideo');
    }

    this.updatePlayStateUI(true);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  }

  pause() {
    this.isPlaying = false;

    // Check offline native video
    if (this.mainVideo && !this.mainVideo.classList.contains('hidden')) {
      this.mainVideo.pause();
    }

    this.sendCommand('pauseVideo');
    if (this.audioEl) {
      this.audioEl.pause();
    }

    this.updatePlayStateUI(false);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
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
