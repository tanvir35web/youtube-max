/**
 * YouTube Max - Core Application Logic
 */

// Curated active public Invidious instances with CORS support
const DEFAULT_INSTANCES = [
  'https://inv.tux.pizza',
  'https://invidious.no-punts.net',
  'https://invidious.nerdvpn.de',
  'https://vid.priv.au',
  'https://invidious.jing.rocks',
  'https://yt.artemislena.eu',
  'https://invidious.drgns.space'
];

class App {
  constructor() {
    this.currentInstance = localStorage.getItem('ytmax_instance') || DEFAULT_INSTANCES[0];
    this.instanceIndex = DEFAULT_INSTANCES.indexOf(this.currentInstance);
    if (this.instanceIndex === -1) this.instanceIndex = 0;

    this.player = null;
    this.activeTopic = 'trending';
    this.currentRelatedVideos = [];
    this.savedVideos = JSON.parse(localStorage.getItem('ytmax_saved') || '[]');
    this.historyVideos = JSON.parse(localStorage.getItem('ytmax_history') || '[]');

    this.initElements();
    this.initPlayer();
    this.initEvents();
    this.populateInstances();
    this.loadFeed('trending');
    this.checkStandaloneMode();
  }

  initElements() {
    this.grid = document.getElementById('videoGrid');
    this.feedLoading = document.getElementById('feedLoading');
    this.feedError = document.getElementById('feedError');
    this.feedErrorMsg = document.getElementById('feedErrorMsg');
    this.retryBtn = document.getElementById('retryBtn');

    this.searchOverlay = document.getElementById('searchOverlay');
    this.searchInput = document.getElementById('searchInput');
    this.searchClearBtn = document.getElementById('searchClearBtn');
    this.searchBackBtn = document.getElementById('searchBackBtn');
    this.searchOpenBtn = document.getElementById('searchOpenBtn');
    this.searchSubmitBtn = document.getElementById('searchSubmitBtn');
    this.pasteUrlBtn = document.getElementById('pasteUrlBtn');

    this.categoryChips = document.getElementById('categoryChips');
    this.watchModal = document.getElementById('watchModal');
    this.watchTitle = document.getElementById('watchTitle');
    this.watchViews = document.getElementById('watchViews');
    this.watchDate = document.getElementById('watchDate');
    this.watchLikes = document.getElementById('watchLikes');
    this.channelAvatar = document.getElementById('channelAvatar');
    this.channelName = document.getElementById('channelName');
    this.channelSubs = document.getElementById('channelSubs');
    this.descriptionBox = document.getElementById('descriptionBox');
    this.descriptionText = document.getElementById('descriptionText');
    this.descToggleBtn = document.getElementById('descToggleBtn');
    this.relatedVideos = document.getElementById('relatedVideos');

    this.saveLibraryBtn = document.getElementById('saveLibraryBtn');
    this.saveLibraryText = document.getElementById('saveLibraryText');
    this.shareBtn = document.getElementById('shareBtn');
    this.copyUrlBtn = document.getElementById('copyUrlBtn');

    this.miniPlayer = document.getElementById('miniPlayer');
    this.miniThumbnail = document.getElementById('miniThumbnail');
    this.miniTitle = document.getElementById('miniTitle');
    this.miniAuthor = document.getElementById('miniAuthor');
    this.miniPlayBtn = document.getElementById('miniPlayBtn');
    this.miniCloseBtn = document.getElementById('miniCloseBtn');
    this.miniInfo = document.getElementById('miniInfo');

    this.settingsModal = document.getElementById('settingsModal');
    this.settingsBtn = document.getElementById('settingsBtn');
    this.closeSettingsBtn = document.getElementById('closeSettingsBtn');
    this.instanceSelect = document.getElementById('instanceSelect');
    this.testInstanceBtn = document.getElementById('testInstanceBtn');
    this.instancePingResult = document.getElementById('instancePingResult');

    this.navHome = document.getElementById('navHome');
    this.navTrending = document.getElementById('navTrending');
    this.navLibrary = document.getElementById('navLibrary');
    this.navSettings = document.getElementById('navSettings');
    this.libraryScreen = document.getElementById('libraryScreen');
    this.savedVideosList = document.getElementById('savedVideosList');
    this.historyVideosList = document.getElementById('historyVideosList');
    this.clearHistoryBtn = document.getElementById('clearHistoryBtn');
  }

  initPlayer() {
    this.player = new YouTubePlayer();
    this.player.onNextTrackCallback = () => this.playNextRelatedVideo();
  }

  initEvents() {
    // Retry Feed
    this.retryBtn.addEventListener('click', () => {
      this.rotateInstance();
      this.loadFeed(this.activeTopic);
    });

    // Search events
    this.searchOpenBtn.addEventListener('click', () => {
      this.searchOverlay.classList.remove('hidden');
      this.searchInput.focus();
    });

    this.searchBackBtn.addEventListener('click', () => {
      this.searchOverlay.classList.add('hidden');
    });

    this.searchInput.addEventListener('input', () => {
      if (this.searchInput.value.trim().length > 0) {
        this.searchClearBtn.classList.remove('hidden');
      } else {
        this.searchClearBtn.classList.add('hidden');
      }
    });

    this.searchClearBtn.addEventListener('click', () => {
      this.searchInput.value = '';
      this.searchClearBtn.classList.add('hidden');
      this.searchInput.focus();
    });

    const triggerSearch = () => {
      const q = this.searchInput.value.trim();
      if (!q) return;
      this.searchOverlay.classList.add('hidden');

      // Check if user entered or pasted YouTube URL
      const ytId = this.extractYouTubeId(q);
      if (ytId) {
        this.openVideo(ytId);
      } else {
        this.activeTopic = `search:${q}`;
        this.loadSearch(q);
      }
    };

    this.searchSubmitBtn.addEventListener('click', triggerSearch);
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') triggerSearch();
    });

    // Quick Paste URL button
    this.pasteUrlBtn.addEventListener('click', async () => {
      try {
        let text = '';
        if (navigator.clipboard && navigator.clipboard.readText) {
          text = await navigator.clipboard.readText();
        }
        if (!text) {
          text = prompt('Paste YouTube URL or Video ID:');
        }
        if (text) {
          const ytId = this.extractYouTubeId(text.trim());
          if (ytId) {
            window.showToast('Opening video...');
            this.openVideo(ytId);
          } else {
            this.searchInput.value = text.trim();
            triggerSearch();
          }
        }
      } catch (err) {
        const text = prompt('Paste YouTube URL or Video ID:');
        if (text) {
          const ytId = this.extractYouTubeId(text.trim());
          if (ytId) this.openVideo(ytId);
        }
      }
    });

    // Category Chips
    this.categoryChips.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const topic = chip.dataset.topic;
      this.activeTopic = topic;
      this.loadFeed(topic);
    });

    // Mini Player
    this.miniInfo.addEventListener('click', () => {
      this.player.restorePlayer();
    });

    this.miniPlayBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.player.togglePlay();
    });

    this.miniCloseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.player.pause();
      window.hideMiniPlayer();
    });

    // Description expand
    this.descToggleBtn.addEventListener('click', () => {
      const isExpanded = this.descriptionText.classList.toggle('expanded');
      this.descToggleBtn.textContent = isExpanded ? 'Show less' : 'Show more';
    });

    // Save to Library
    this.saveLibraryBtn.addEventListener('click', () => {
      if (!this.player.currentVideoData) return;
      this.toggleSaveVideo(this.player.currentVideoData);
    });

    // Share & Copy URL
    this.shareBtn.addEventListener('click', () => {
      if (!this.player.currentVideoData) return;
      const url = `https://youtu.be/${this.player.currentVideoData.videoId}`;
      if (navigator.share) {
        navigator.share({
          title: this.player.currentVideoData.title,
          url: url
        }).catch(() => {});
      } else {
        this.copyToClipboard(url);
      }
    });

    this.copyUrlBtn.addEventListener('click', () => {
      if (!this.player.currentVideoData) return;
      const url = `https://youtu.be/${this.player.currentVideoData.videoId}`;
      this.copyToClipboard(url);
    });

    // Settings Modal
    this.settingsBtn.addEventListener('click', () => {
      this.settingsModal.classList.remove('hidden');
    });

    this.closeSettingsBtn.addEventListener('click', () => {
      this.settingsModal.classList.add('hidden');
    });

    this.instanceSelect.addEventListener('change', () => {
      this.currentInstance = this.instanceSelect.value;
      localStorage.setItem('ytmax_instance', this.currentInstance);
      window.showToast(`Server changed: ${new URL(this.currentInstance).hostname}`);
    });

    this.testInstanceBtn.addEventListener('click', () => {
      this.testCurrentInstance();
    });

    // Navigation Tabs
    this.navHome.addEventListener('click', () => {
      this.switchTab('home');
      this.loadFeed('trending');
    });

    this.navTrending.addEventListener('click', () => {
      this.switchTab('home');
      this.loadFeed('trending');
    });

    this.navLibrary.addEventListener('click', () => {
      this.switchTab('library');
      this.renderLibrary();
    });

    this.navSettings.addEventListener('click', () => {
      this.settingsModal.classList.remove('hidden');
    });

    this.clearHistoryBtn.addEventListener('click', () => {
      if (confirm('Clear watch history?')) {
        this.historyVideos = [];
        localStorage.removeItem('ytmax_history');
        this.renderLibrary();
        window.showToast('Watch history cleared');
      }
    });

    // App Logo click -> scroll to top
    document.getElementById('logoBtn').addEventListener('click', () => {
      document.getElementById('mainFeed').scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  switchTab(tab) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if (tab === 'home') {
      this.navHome.classList.add('active');
      document.getElementById('mainFeed').classList.remove('hidden');
      this.categoryChips.classList.remove('hidden');
      this.libraryScreen.classList.add('hidden');
    } else if (tab === 'library') {
      this.navLibrary.classList.add('active');
      document.getElementById('mainFeed').classList.add('hidden');
      this.categoryChips.classList.add('hidden');
      this.libraryScreen.classList.remove('hidden');
    }
  }

  extractYouTubeId(urlOrText) {
    if (!urlOrText) return null;
    const clean = urlOrText.trim();
    // Raw 11 char ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean;
    // Standard YouTube URL regex
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*).*/;
    const match = clean.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }

  rotateInstance() {
    this.instanceIndex = (this.instanceIndex + 1) % DEFAULT_INSTANCES.length;
    this.currentInstance = DEFAULT_INSTANCES[this.instanceIndex];
    localStorage.setItem('ytmax_instance', this.currentInstance);
    this.instanceSelect.value = this.currentInstance;
    console.log(`Rotated to instance: ${this.currentInstance}`);
  }

  async fetchWithFallback(endpoint, maxRetries = 3) {
    let attempts = 0;
    while (attempts < maxRetries) {
      const url = `${this.currentInstance}${endpoint}`;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6500);

        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.warn(`Request failed on ${this.currentInstance}:`, err);
      }
      // If failed, rotate to next instance and retry
      this.rotateInstance();
      attempts++;
    }
    throw new Error('All streaming instances failed. Please check network or try again.');
  }

  async loadFeed(topic) {
    this.feedLoading.classList.remove('hidden');
    this.feedError.classList.add('hidden');
    this.grid.innerHTML = '';

    try {
      let data = [];
      if (topic === 'trending') {
        data = await this.fetchWithFallback('/api/v1/trending?region=US');
      } else {
        // Query category
        const queries = {
          music: 'Music official songs trending',
          gaming: 'gaming gameplay trending',
          news: 'world news today',
          podcasts: 'podcast full episode',
          bangla: 'bangla song natok comedy trending',
          lofi: 'lofi hip hop chill beats live',
          tech: 'tech gadget review unboxing'
        };
        const q = queries[topic] || topic;
        data = await this.fetchWithFallback(`/api/v1/search?q=${encodeURIComponent(q)}&type=video`);
      }

      this.feedLoading.classList.add('hidden');
      this.renderVideoGrid(data);
    } catch (err) {
      this.feedLoading.classList.add('hidden');
      this.feedError.classList.remove('hidden');
      this.feedErrorMsg.textContent = 'Server busy. Tap retry to connect to backup server.';
    }
  }

  async loadSearch(query) {
    this.feedLoading.classList.remove('hidden');
    this.feedError.classList.add('hidden');
    this.grid.innerHTML = '';

    try {
      const data = await this.fetchWithFallback(`/api/v1/search?q=${encodeURIComponent(query)}&type=video`);
      this.feedLoading.classList.add('hidden');
      this.renderVideoGrid(data);
    } catch (err) {
      this.feedLoading.classList.add('hidden');
      this.feedError.classList.remove('hidden');
      this.feedErrorMsg.textContent = 'Search failed. Tap retry.';
    }
  }

  renderVideoGrid(videos) {
    if (!videos || !videos.length) {
      this.grid.innerHTML = '<div class="feed-error"><p>No videos found</p></div>';
      return;
    }

    const html = videos.map(v => {
      const id = v.videoId;
      const title = this.escapeHtml(v.title || 'Untitled');
      const author = this.escapeHtml(v.author || 'Unknown');
      const views = this.formatViews(v.viewCount || v.views || 0);
      const time = v.publishedText || 'Recently';
      const duration = this.formatDuration(v.lengthSeconds);
      const thumb = (v.videoThumbnails && v.videoThumbnails[0]?.url) || `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
      const authorThumb = (v.authorThumbnails && v.authorThumbnails[0]?.url) || '';

      return `
        <article class="video-card" data-id="${id}">
          <div class="thumb-container">
            <img src="${thumb}" alt="${title}" loading="lazy">
            <span class="duration-badge">${duration}</span>
          </div>
          <div class="video-card-meta">
            ${authorThumb ? `<img src="${authorThumb}" alt="${author}" class="channel-avatar-sm" loading="lazy">` : ''}
            <div class="video-text-meta">
              <h3 class="video-card-title">${title}</h3>
              <p class="video-card-sub">${author} • ${views} • ${time}</p>
            </div>
          </div>
        </article>
      `;
    }).join('');

    this.grid.innerHTML = html;

    // Attach click events
    this.grid.querySelectorAll('.video-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        this.openVideo(id);
      });
    });
  }

  async openVideo(videoId) {
    window.hideMiniPlayer();
    this.watchModal.classList.remove('hidden');
    document.getElementById('watchScroll').scrollTo({ top: 0, behavior: 'instant' });

    // Temporary Loading state in watch page
    this.watchTitle.textContent = 'Loading video stream...';
    this.watchViews.textContent = 'Ad-Free Playback';
    this.watchDate.textContent = '';
    this.channelName.textContent = '';
    this.descriptionText.textContent = '';
    this.relatedVideos.innerHTML = '<div class="feed-loading"><div class="spinner"></div></div>';

    try {
      const data = await this.fetchWithFallback(`/api/v1/videos/${videoId}`);

      // Parse video info
      const title = data.title;
      const author = data.author;
      const views = this.formatViews(data.viewCount);
      const date = data.publishedText || '';
      const likes = this.formatViews(data.likeCount || 0);
      const subs = data.subCountText || '';
      const thumb = (data.videoThumbnails && data.videoThumbnails[0]?.url) || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      const avatar = (data.authorThumbnails && data.authorThumbnails[0]?.url) || '';
      const desc = data.description || 'No description provided.';

      this.watchTitle.textContent = title;
      this.watchViews.textContent = `${views} views`;
      this.watchDate.textContent = date;
      this.watchLikes.textContent = likes ? `${likes}` : 'Like';
      this.channelName.textContent = author;
      this.channelSubs.textContent = subs ? `${subs} subscribers` : '';
      if (avatar) this.channelAvatar.src = avatar;
      this.descriptionText.textContent = desc;

      // Extract raw media streams (No ads!)
      const streams = this.extractStreams(data);

      const videoPayload = {
        videoId,
        title,
        author,
        thumbnail: thumb,
        duration: data.lengthSeconds
      };

      // Record in watch history
      this.addToHistory(videoPayload);
      this.updateSaveButtonState(videoId);

      // Feed streams into player engine
      await this.player.loadStreams(videoPayload, streams);

      // Render Recommended / Up Next videos
      this.currentRelatedVideos = data.recommendedVideos || [];
      this.renderRelatedVideos(this.currentRelatedVideos);

    } catch (err) {
      console.error('Failed to open video:', err);
      this.watchTitle.textContent = 'Failed to load video stream. Please try again.';
      window.showToast('Stream extraction error. Trying alternate instance...');
    }
  }

  extractStreams(videoData) {
    const result = { video: [], audio: [] };

    // Format streams (combined video + audio)
    if (videoData.formatStreams && videoData.formatStreams.length > 0) {
      videoData.formatStreams.forEach(f => {
        let q = f.qualityLabel || f.quality || '360p';
        if (q.includes('720')) q = '720p';
        else if (q.includes('1080')) q = '1080p';
        else if (q.includes('480')) q = '480p';
        else if (q.includes('360')) q = '360p';

        result.video.push({
          url: f.url,
          quality: q,
          type: f.type,
          itag: f.itag
        });
      });
    }

    // Adaptive formats (Audio-only for background play & screen-off persistence!)
    if (videoData.adaptiveFormats && videoData.adaptiveFormats.length > 0) {
      videoData.adaptiveFormats.forEach(f => {
        if (f.type && f.type.startsWith('audio/')) {
          result.audio.push({
            url: f.url,
            bitrate: f.bitrate,
            quality: f.audioQuality || 'Standard',
            type: f.type
          });
        }
      });
    }

    // Sort audio by bitrate descending
    result.audio.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

    // Fallback: If no separate audio, copy first video stream as audio source
    if (result.audio.length === 0 && result.video.length > 0) {
      result.audio.push({ url: result.video[0].url, quality: 'Standard' });
    }

    // Fallback HLS stream if available
    if (videoData.hlsUrl) {
      result.video.unshift({ url: videoData.hlsUrl, quality: 'Auto (HLS)' });
    }

    return result;
  }

  renderRelatedVideos(list) {
    if (!list || !list.length) {
      this.relatedVideos.innerHTML = '<p class="empty-text">No recommendations available</p>';
      return;
    }

    const html = list.map(v => {
      const id = v.videoId;
      const title = this.escapeHtml(v.title || 'Untitled');
      const author = this.escapeHtml(v.author || '');
      const views = this.formatViews(v.viewCount || 0);
      const thumb = (v.videoThumbnails && v.videoThumbnails[0]?.url) || `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

      return `
        <div class="related-card" data-id="${id}">
          <img src="${thumb}" alt="${title}" class="related-thumb" loading="lazy">
          <div class="related-meta">
            <h4 class="related-title">${title}</h4>
            <p class="related-sub">${author}</p>
            <p class="related-sub">${views}</p>
          </div>
        </div>
      `;
    }).join('');

    this.relatedVideos.innerHTML = html;

    this.relatedVideos.querySelectorAll('.related-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        this.openVideo(id);
      });
    });
  }

  playNextRelatedVideo() {
    if (this.currentRelatedVideos && this.currentRelatedVideos.length > 0) {
      const next = this.currentRelatedVideos[0];
      if (next && next.videoId) {
        window.showToast(`Autoplay: ${next.title}`);
        this.openVideo(next.videoId);
      }
    }
  }

  // Library & Saved Management
  toggleSaveVideo(video) {
    const idx = this.savedVideos.findIndex(v => v.videoId === video.videoId);
    if (idx > -1) {
      this.savedVideos.splice(idx, 1);
      window.showToast('Removed from Saved');
    } else {
      this.savedVideos.unshift(video);
      window.showToast('Saved to Library');
    }
    localStorage.setItem('ytmax_saved', JSON.stringify(this.savedVideos));
    this.updateSaveButtonState(video.videoId);
  }

  updateSaveButtonState(videoId) {
    const isSaved = this.savedVideos.some(v => v.videoId === videoId);
    this.saveLibraryText.textContent = isSaved ? 'Saved ✓' : 'Save';
  }

  addToHistory(video) {
    this.historyVideos = this.historyVideos.filter(v => v.videoId !== video.videoId);
    this.historyVideos.unshift(video);
    if (this.historyVideos.length > 50) this.historyVideos.pop();
    localStorage.setItem('ytmax_history', JSON.stringify(this.historyVideos));
  }

  renderLibrary() {
    // Saved Videos
    if (this.savedVideos.length === 0) {
      this.savedVideosList.innerHTML = '<p class="empty-text">No saved videos yet.</p>';
    } else {
      this.savedVideosList.innerHTML = this.savedVideos.map(v => `
        <div class="related-card" data-id="${v.videoId}">
          <img src="${v.thumbnail}" class="related-thumb" alt="${v.title}">
          <div class="related-meta">
            <h4 class="related-title">${this.escapeHtml(v.title)}</h4>
            <p class="related-sub">${this.escapeHtml(v.author)}</p>
          </div>
        </div>
      `).join('');
    }

    // History Videos
    if (this.historyVideos.length === 0) {
      this.historyVideosList.innerHTML = '<p class="empty-text">Your watch history is empty.</p>';
    } else {
      this.historyVideosList.innerHTML = this.historyVideos.map(v => `
        <div class="related-card" data-id="${v.videoId}">
          <img src="${v.thumbnail}" class="related-thumb" alt="${v.title}">
          <div class="related-meta">
            <h4 class="related-title">${this.escapeHtml(v.title)}</h4>
            <p class="related-sub">${this.escapeHtml(v.author)}</p>
          </div>
        </div>
      `).join('');
    }

    // Attach click
    this.libraryScreen.querySelectorAll('.related-card').forEach(card => {
      card.addEventListener('click', () => {
        this.openVideo(card.dataset.id);
      });
    });
  }

  populateInstances() {
    this.instanceSelect.innerHTML = DEFAULT_INSTANCES.map(inst => `
      <option value="${inst}" ${inst === this.currentInstance ? 'selected' : ''}>
        ${new URL(inst).hostname}
      </option>
    `).join('');
  }

  async testCurrentInstance() {
    this.instancePingResult.textContent = 'Testing...';
    const start = performance.now();
    try {
      const res = await fetch(`${this.currentInstance}/api/v1/trending?region=US`, {
        signal: AbortSignal.timeout(4000)
      });
      const end = performance.now();
      if (res.ok) {
        this.instancePingResult.textContent = `Online (${Math.round(end - start)}ms)`;
        this.instancePingResult.style.color = '#4caf50';
      } else {
        throw new Error('HTTP ' + res.status);
      }
    } catch (e) {
      this.instancePingResult.textContent = 'Slow/Offline - Tap Retry to switch';
      this.instancePingResult.style.color = '#ff5252';
    }
  }

  checkStandaloneMode() {
    const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    if (!isStandalone && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
      setTimeout(() => {
        window.showToast('💡 Tip: Tap Share & "Add to Home Screen" for full screen & screen-off play!');
      }, 2500);
    }
  }

  copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        window.showToast('Link copied to clipboard!');
      }).catch(() => {});
    } else {
      prompt('Copy video link:', text);
    }
  }

  formatViews(count) {
    if (!count) return '0';
    if (count >= 1000000000) return (count / 1000000000).toFixed(1) + 'B';
    if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
    if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
    return count.toString();
  }

  formatDuration(seconds) {
    if (!seconds) return '0:00';
    const s = Math.floor(seconds % 60);
    const m = Math.floor((seconds / 60) % 60);
    const h = Math.floor(seconds / 3600);
    const pad = (n) => (n < 10 ? '0' + n : n);
    if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
    return `${m}:${pad(s)}`;
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

// Global UI Helper Functions
window.showToast = function(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 2800);
};

window.showMiniPlayer = function(video, isPlaying) {
  const mini = document.getElementById('miniPlayer');
  if (!video || !mini) return;
  document.getElementById('miniTitle').textContent = video.title;
  document.getElementById('miniAuthor').textContent = video.author;
  document.getElementById('miniThumbnail').src = video.thumbnail;
  mini.classList.remove('hidden');
  window.updateMiniPlayerState(isPlaying);
};

window.hideMiniPlayer = function() {
  const mini = document.getElementById('miniPlayer');
  if (mini) mini.classList.add('hidden');
};

window.updateMiniPlayerState = function(isPlaying) {
  const btn = document.getElementById('miniPlayBtn');
  if (!btn) return;
  btn.innerHTML = isPlaying
    ? `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`
    : `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});

