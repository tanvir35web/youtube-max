/**
 * YouTube Max - Core Application Logic
 * Integrates with YouTube InnerTube Backend API for 100% Reliable Loading
 */

class App {
  constructor() {
    this.player = null;
    this.activeTopic = 'trending';
    this.currentRelatedVideos = [];
    this.savedVideos = JSON.parse(localStorage.getItem('ytmax_saved') || '[]');
    this.historyVideos = JSON.parse(localStorage.getItem('ytmax_history') || '[]');

    this.initElements();
    this.initPlayer();
    this.initEvents();
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

    // "Autoplay Next Video" setting (on by default, remembered across launches)
    this.autoplayToggle = document.getElementById('autoplayToggle');
    let autoplayNext = true;
    try {
      autoplayNext = localStorage.getItem('ytmax_autoplay') !== 'off';
    } catch (e) {}
    this.autoplayToggle.checked = autoplayNext;
    this.autoplayToggle.addEventListener('change', () => {
      try {
        localStorage.setItem('ytmax_autoplay', this.autoplayToggle.checked ? 'on' : 'off');
      } catch (e) {}
    });

    // When a video finishes, play the first "Up Next" video if autoplay is on
    this.player.onVideoEnded = () => {
      if (this.autoplayToggle.checked) this.playNextRelatedVideo();
    };
  }

  initEvents() {
    // Retry Feed
    this.retryBtn.addEventListener('click', () => {
      this.loadFeed(this.activeTopic);
    });

    // Search Box Interaction
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
        this.openVideoById(ytId, 'YouTube Video', 'YouTube');
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
            this.openVideoById(ytId, 'Pasted YouTube Video', 'YouTube');
          } else {
            this.searchInput.value = text.trim();
            triggerSearch();
          }
        }
      } catch (err) {
        const text = prompt('Paste YouTube URL or Video ID:');
        if (text) {
          const ytId = this.extractYouTubeId(text.trim());
          if (ytId) this.openVideoById(ytId, 'Pasted YouTube Video', 'YouTube');
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
    if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*).*/;
    const match = clean.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }

  async loadFeed(topic) {
    this.feedLoading.classList.remove('hidden');
    this.feedError.classList.add('hidden');
    this.grid.innerHTML = '';

    try {
      const res = await fetch(`/api/feed?topic=${encodeURIComponent(topic)}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const videos = await res.json();
      
      this.feedLoading.classList.add('hidden');
      this.renderVideoGrid(videos);
    } catch (err) {
      console.warn('Feed load error:', err);
      this.feedLoading.classList.add('hidden');
      this.feedError.classList.remove('hidden');
      this.feedErrorMsg.textContent = 'Server busy. Tap retry to reload feed.';
    }
  }

  async loadSearch(query) {
    this.feedLoading.classList.remove('hidden');
    this.feedError.classList.add('hidden');
    this.grid.innerHTML = '';

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const videos = await res.json();

      this.feedLoading.classList.add('hidden');
      this.renderVideoGrid(videos);
    } catch (err) {
      console.warn('Search error:', err);
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
      const author = this.escapeHtml(v.author || 'YouTube Channel');
      const views = v.views || '';
      const time = v.published || '';
      const duration = v.duration || '';
      const thumb = v.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
      const authorThumb = v.authorThumb || '';

      return `
        <article class="video-card" data-id="${id}" data-title="${title}" data-author="${author}" data-thumb="${thumb}">
          <div class="thumb-container">
            <img src="${thumb}" alt="${title}" loading="lazy">
            ${duration ? `<span class="duration-badge">${duration}</span>` : ''}
          </div>
          <div class="video-card-meta">
            ${authorThumb ? `<img src="${authorThumb}" alt="${author}" class="channel-avatar-sm" loading="lazy">` : ''}
            <div class="video-text-meta">
              <h3 class="video-card-title">${title}</h3>
              <p class="video-card-sub">${author} ${views ? '• ' + views : ''} ${time ? '• ' + time : ''}</p>
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
        const title = card.dataset.title;
        const author = card.dataset.author;
        const thumb = card.dataset.thumb;
        this.openVideoById(id, title, author, thumb);
      });
    });
  }

  async openVideoById(videoId, title, author, thumb) {
    window.hideMiniPlayer();
    this.watchModal.classList.remove('hidden');
    document.getElementById('watchScroll').scrollTo({ top: 0, behavior: 'instant' });

    const fallbackThumb = thumb || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    this.watchTitle.textContent = title || 'Playing Video';
    this.watchViews.textContent = 'Ad-Free Playback';
    this.watchDate.textContent = 'Ad Blocked ✓';
    this.channelName.textContent = author || 'YouTube';
    this.channelSubs.textContent = '';
    this.descriptionText.textContent = `Playing ${title || 'video'} on YouTube Max. Zero ads, background audio enabled.`;
    this.channelAvatar.src = '/icons/icon-192.png';

    const videoPayload = {
      videoId,
      title: title || 'YouTube Video',
      author: author || 'YouTube',
      thumbnail: fallbackThumb
    };

    // Save to history & update button
    this.addToHistory(videoPayload);
    this.updateSaveButtonState(videoId);

    // Load video in player engine
    this.player.loadVideo(videoPayload);

    // Fetch Up Next related videos
    this.loadRelatedVideos(title || 'trending');
  }

  async loadRelatedVideos(query) {
    this.relatedVideos.innerHTML = '<div class="feed-loading"><div class="spinner"></div></div>';
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error('Search failed');
      const list = await res.json();
      this.currentRelatedVideos = list.filter(v => v.videoId !== this.player.currentVideoData?.videoId);
      this.renderRelatedVideos(this.currentRelatedVideos);
    } catch (e) {
      this.relatedVideos.innerHTML = '<p class="empty-text">No recommendations available</p>';
    }
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
      const views = v.views || '';
      const thumb = v.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

      return `
        <div class="related-card" data-id="${id}" data-title="${title}" data-author="${author}" data-thumb="${thumb}">
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
        const title = card.dataset.title;
        const author = card.dataset.author;
        const thumb = card.dataset.thumb;
        this.openVideoById(id, title, author, thumb);
      });
    });
  }

  playNextRelatedVideo() {
    if (this.currentRelatedVideos && this.currentRelatedVideos.length > 0) {
      const next = this.currentRelatedVideos[0];
      if (next && next.videoId) {
        window.showToast(`Autoplay: ${next.title}`);
        this.openVideoById(next.videoId, next.title, next.author, next.thumbnail);
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
        <div class="related-card" data-id="${v.videoId}" data-title="${this.escapeHtml(v.title)}" data-author="${this.escapeHtml(v.author)}" data-thumb="${v.thumbnail}">
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
        <div class="related-card" data-id="${v.videoId}" data-title="${this.escapeHtml(v.title)}" data-author="${this.escapeHtml(v.author)}" data-thumb="${v.thumbnail}">
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
        const id = card.dataset.id;
        const title = card.dataset.title;
        const author = card.dataset.author;
        const thumb = card.dataset.thumb;
        this.openVideoById(id, title, author, thumb);
      });
    });
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
