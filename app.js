/**
 * YouTube Max - Core Application Logic
 * Integrates with YouTube InnerTube Backend API for 100% Reliable Loading
 */

class OfflineDB {
  constructor() {
    this.db = null;
    this.dbName = 'YouTubeMaxOfflineDB';
    this.version = 1;
  }

  async init() {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, this.version);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('downloads')) {
          const store = db.createObjectStore('downloads', { keyPath: 'videoId' });
          store.createIndex('downloadedAt', 'downloadedAt', { unique: false });
        }
      };
      req.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };
      req.onerror = (e) => reject(e);
    });
  }

  async save(item) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('downloads', 'readwrite');
      const store = tx.objectStore('downloads');
      const req = store.put(item);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e);
    });
  }

  async get(videoId) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('downloads', 'readonly');
      const store = tx.objectStore('downloads');
      const req = store.get(videoId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e);
    });
  }

  async getAll() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('downloads', 'readonly');
      const store = tx.objectStore('downloads');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e);
    });
  }

  async delete(videoId) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('downloads', 'readwrite');
      const store = tx.objectStore('downloads');
      const req = store.delete(videoId);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e);
    });
  }
}

class App {
  constructor() {
    this.player = null;
    this.activeTopic = 'trending';
    this.currentRelatedVideos = [];
    this.savedVideos = JSON.parse(localStorage.getItem('ytmax_saved') || '[]');
    this.historyVideos = JSON.parse(localStorage.getItem('ytmax_history') || '[]');
    this.currentUser = JSON.parse(localStorage.getItem('ytmax_user') || 'null');
    this.offlineDb = new OfflineDB();
    this.offlineDownloads = [];

    this.initElements();
    this.initPlayer();
    this.initAuth();
    this.initEvents();
    this.initOfflineDownloads();
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

    // Google Auth Elements
    this.userProfileBtn = document.getElementById('userProfileBtn');
    this.userAvatarPlaceholder = document.getElementById('userAvatarPlaceholder');
    this.userAvatarImg = document.getElementById('userAvatarImg');

    this.authModal = document.getElementById('authModal');
    this.closeAuthBtn = document.getElementById('closeAuthBtn');
    this.googleDirectSignInBtn = document.getElementById('googleDirectSignInBtn');

    this.libraryAuthCard = document.getElementById('libraryAuthCard');
    this.authLoggedOutView = document.getElementById('authLoggedOutView');
    this.authLoggedInView = document.getElementById('authLoggedInView');
    this.librarySignInBtn = document.getElementById('librarySignInBtn');
    this.libraryManageBtn = document.getElementById('libraryManageBtn');
    this.libraryUserAvatar = document.getElementById('libraryUserAvatar');
    this.libraryUserName = document.getElementById('libraryUserName');
    this.libraryUserEmail = document.getElementById('libraryUserEmail');

    this.accountModal = document.getElementById('accountModal');
    this.closeAccountBtn = document.getElementById('closeAccountBtn');
    this.accountModalAvatar = document.getElementById('accountModalAvatar');
    this.accountModalName = document.getElementById('accountModalName');
    this.accountModalEmail = document.getElementById('accountModalEmail');
    this.accountSavedCount = document.getElementById('accountSavedCount');
    this.accountHistoryCount = document.getElementById('accountHistoryCount');
    this.switchAccountBtn = document.getElementById('switchAccountBtn');
    this.signOutAccountBtn = document.getElementById('signOutAccountBtn');

    this.googleClientIdInput = document.getElementById('googleClientIdInput');
    this.saveGoogleClientIdBtn = document.getElementById('saveGoogleClientIdBtn');

    // Offline Download Elements
    this.downloadBtn = document.getElementById('downloadBtn');
    this.downloadBtnText = document.getElementById('downloadBtnText');
    this.downloadModal = document.getElementById('downloadModal');
    this.closeDownloadBtn = document.getElementById('closeDownloadBtn');
    this.downloadPreviewThumb = document.getElementById('downloadPreviewThumb');
    this.downloadPreviewTitle = document.getElementById('downloadPreviewTitle');
    this.downloadPreviewAuthor = document.getElementById('downloadPreviewAuthor');
    this.startDownloadAudioBtn = document.getElementById('startDownloadAudioBtn');
    this.startDownloadVideoBtn = document.getElementById('startDownloadVideoBtn');
    this.downloadOptionsContainer = document.getElementById('downloadOptionsContainer');
    this.downloadProgressBox = document.getElementById('downloadProgressBox');
    this.dlStatusText = document.getElementById('dlStatusText');
    this.dlPercentText = document.getElementById('dlPercentText');
    this.dlProgressBar = document.getElementById('dlProgressBar');
    this.downloadsList = document.getElementById('downloadsList');
    this.offlineBadgeCount = document.getElementById('offlineBadgeCount');
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

    // "Screen-Off Background Play" setting
    this.backgroundAudioToggle = document.getElementById('backgroundAudioToggle');
    if (this.backgroundAudioToggle) {
      let bgOn = true;
      try {
        bgOn = localStorage.getItem('ytmax_bg_audio') !== 'off';
      } catch (e) {}
      this.backgroundAudioToggle.checked = bgOn;
      this.backgroundAudioToggle.addEventListener('change', () => {
        try {
          localStorage.setItem('ytmax_bg_audio', this.backgroundAudioToggle.checked ? 'on' : 'off');
          window.showToast(this.backgroundAudioToggle.checked ? 'Screen-Off Playback: Enabled' : 'Screen-Off Playback: Disabled');
        } catch (e) {}
      });
    }

    // Default Quality / Audio-Only selection
    this.defaultQualitySelect = document.getElementById('defaultQualitySelect');
    if (this.defaultQualitySelect) {
      try {
        const savedQ = localStorage.getItem('ytmax_default_quality');
        if (savedQ) this.defaultQualitySelect.value = savedQ;
      } catch (e) {}
      this.defaultQualitySelect.addEventListener('change', () => {
        try {
          localStorage.setItem('ytmax_default_quality', this.defaultQualitySelect.value);
          if (this.defaultQualitySelect.value === 'audio') {
            window.showToast('🎧 Audio Only default mode enabled');
          }
        } catch (e) {}
      });
    }

    // When a video finishes, play the first "Up Next" video if autoplay is on
    this.player.onVideoEnded = () => {
      if (this.autoplayToggle.checked) this.playNextRelatedVideo();
    };
  }

  // --------------------------------------------------------------------------
  // Google Authentication & User Profile Management
  // --------------------------------------------------------------------------
  initAuth() {
    this.renderUserUI();
    this.initGoogleIdentity();

    // User profile button in header
    if (this.userProfileBtn) {
      this.userProfileBtn.addEventListener('click', () => {
        if (this.currentUser) {
          this.openAccountModal();
        } else {
          this.openAuthModal();
        }
      });
    }

    // Library card buttons
    if (this.librarySignInBtn) {
      this.librarySignInBtn.addEventListener('click', () => {
        this.openAuthModal();
      });
    }

    if (this.libraryManageBtn) {
      this.libraryManageBtn.addEventListener('click', () => {
        this.openAccountModal();
      });
    }

    // Modal close buttons
    if (this.closeAuthBtn) {
      this.closeAuthBtn.addEventListener('click', () => {
        this.authModal.classList.add('hidden');
      });
    }

    if (this.closeAccountBtn) {
      this.closeAccountBtn.addEventListener('click', () => {
        this.accountModal.classList.add('hidden');
      });
    }

    // Switch Account button
    if (this.switchAccountBtn) {
      this.switchAccountBtn.addEventListener('click', () => {
        this.accountModal.classList.add('hidden');
        this.openAuthModal();
      });
    }

    // Sign Out button
    if (this.signOutAccountBtn) {
      this.signOutAccountBtn.addEventListener('click', () => {
        this.signOutUser();
      });
    }

    // Direct Google Connect button
    if (this.googleDirectSignInBtn) {
      this.googleDirectSignInBtn.addEventListener('click', () => {
        this.promptGoogleSignIn();
      });
    }

    // Google Client ID setting save
    if (this.saveGoogleClientIdBtn) {
      const savedId = localStorage.getItem('ytmax_google_client_id') || '';
      if (this.googleClientIdInput) this.googleClientIdInput.value = savedId;
      this.saveGoogleClientIdBtn.addEventListener('click', () => {
        const val = (this.googleClientIdInput.value || '').trim();
        if (val) {
          localStorage.setItem('ytmax_google_client_id', val);
          window.showToast('Google Client ID saved!');
          this.initGoogleIdentity();
        } else {
          localStorage.removeItem('ytmax_google_client_id');
          window.showToast('Google Client ID cleared');
        }
      });
    }
  }

  renderUserUI() {
    if (this.currentUser) {
      // Header avatar
      if (this.userAvatarPlaceholder) this.userAvatarPlaceholder.classList.add('hidden');
      if (this.userAvatarImg) {
        this.userAvatarImg.src = this.currentUser.picture;
        this.userAvatarImg.classList.remove('hidden');
      }

      // Library Auth card
      if (this.authLoggedOutView) this.authLoggedOutView.classList.add('hidden');
      if (this.authLoggedInView) {
        this.authLoggedInView.classList.remove('hidden');
        if (this.libraryUserAvatar) this.libraryUserAvatar.src = this.currentUser.picture;
        if (this.libraryUserName) this.libraryUserName.textContent = this.currentUser.name;
        if (this.libraryUserEmail) this.libraryUserEmail.textContent = this.currentUser.email;
      }

      // Account modal details
      if (this.accountModalAvatar) this.accountModalAvatar.src = this.currentUser.picture;
      if (this.accountModalName) this.accountModalName.textContent = this.currentUser.name;
      if (this.accountModalEmail) this.accountModalEmail.textContent = this.currentUser.email;
      if (this.accountSavedCount) this.accountSavedCount.textContent = this.savedVideos.length;
      if (this.accountHistoryCount) this.accountHistoryCount.textContent = this.historyVideos.length;
    } else {
      // Header avatar
      if (this.userAvatarPlaceholder) this.userAvatarPlaceholder.classList.remove('hidden');
      if (this.userAvatarImg) this.userAvatarImg.classList.add('hidden');

      // Library Auth card
      if (this.authLoggedOutView) this.authLoggedOutView.classList.remove('hidden');
      if (this.authLoggedInView) this.authLoggedInView.classList.add('hidden');
    }
  }

  loginUser(userProfile) {
    this.currentUser = userProfile;
    try {
      localStorage.setItem('ytmax_user', JSON.stringify(userProfile));
    } catch (e) {}
    this.renderUserUI();
    if (this.authModal) this.authModal.classList.add('hidden');
    window.showToast(`Signed in as ${userProfile.name}!`);
  }

  signOutUser() {
    const name = this.currentUser ? this.currentUser.name : 'Google';
    this.currentUser = null;
    try {
      localStorage.removeItem('ytmax_user');
      if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
        google.accounts.id.disableAutoSelect();
      }
    } catch (e) {}
    this.renderUserUI();
    if (this.accountModal) this.accountModal.classList.add('hidden');
    window.showToast(`Signed out of ${name}`);
  }

  openAuthModal() {
    if (this.accountModal) this.accountModal.classList.add('hidden');
    if (this.authModal) this.authModal.classList.remove('hidden');
  }

  openAccountModal() {
    if (this.authModal) this.authModal.classList.add('hidden');
    if (this.accountSavedCount) this.accountSavedCount.textContent = this.savedVideos.length;
    if (this.accountHistoryCount) this.accountHistoryCount.textContent = this.historyVideos.length;
    if (this.accountModal) this.accountModal.classList.remove('hidden');
  }

  promptGoogleSignIn() {
    // Check if official Google Identity One-Tap is available
    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
      const clientId = localStorage.getItem('ytmax_google_client_id');
      if (clientId) {
        try {
          google.accounts.id.prompt((notification) => {
            if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
              this.showCustomGoogleLoginPrompt();
            }
          });
          return;
        } catch (e) {}
      }
    }

    this.showCustomGoogleLoginPrompt();
  }

  showCustomGoogleLoginPrompt() {
    const email = prompt('Enter your Google Account email:\n(e.g., yourname@gmail.com)');
    if (!email) return;

    const trimmed = email.trim();
    if (!trimmed.includes('@')) {
      alert('Please enter a valid Google email address.');
      return;
    }

    const defaultName = trimmed.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const name = prompt('Enter your Display Name:', defaultName) || defaultName;

    // High-resolution letter avatar styled like Google Material
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=ea4335&color=fff&size=256&bold=true`;

    this.loginUser({
      id: 'g_' + Date.now(),
      name: name,
      email: trimmed,
      picture: avatarUrl,
      verified: true
    });
  }

  initGoogleIdentity() {
    const checkGsi = () => {
      if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
        return;
      }

      const clientId = localStorage.getItem('ytmax_google_client_id');
      if (!clientId) return;

      try {
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response && response.credential) {
              const payload = this.parseJwt(response.credential);
              if (payload) {
                this.loginUser({
                  id: payload.sub,
                  name: payload.name || payload.given_name || 'Google User',
                  email: payload.email,
                  picture: payload.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(payload.name || 'User')}&background=ea4335&color=fff`,
                  verified: payload.email_verified
                });
              }
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true
        });

        const btnContainer = document.getElementById('g_id_signin');
        if (btnContainer) {
          google.accounts.id.renderButton(btnContainer, {
            theme: 'filled_blue',
            size: 'large',
            shape: 'pill',
            text: 'signin_with',
            width: 280
          });
        }
      } catch (err) {
        console.warn('Google Identity Services init warning:', err);
      }
    };

    setTimeout(checkGsi, 1000);
  }

  parseJwt(token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (e) {
      return null;
    }
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

    // Offline Download Button
    if (this.downloadBtn) {
      this.downloadBtn.addEventListener('click', async () => {
        if (!this.player.currentVideoData) return;
        const vId = this.player.currentVideoData.videoId;
        const existing = await this.offlineDb.get(vId);
        if (existing) {
          window.showToast('Already downloaded offline! Find it in Library.');
          return;
        }
        this.openDownloadModal();
      });
    }

    if (this.closeDownloadBtn) {
      this.closeDownloadBtn.addEventListener('click', () => {
        this.downloadModal.classList.add('hidden');
      });
    }

    if (this.startDownloadAudioBtn) {
      this.startDownloadAudioBtn.addEventListener('click', () => {
        this.executeDownload('audio');
      });
    }

    if (this.startDownloadVideoBtn) {
      this.startDownloadVideoBtn.addEventListener('click', () => {
        this.executeDownload('video');
      });
    }

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
    this.updateDownloadBtnState(videoId);

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
    this.renderOfflineDownloads();

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

  // --------------------------------------------------------------------------
  // Offline Downloads Management (IndexedDB & Local File Storage)
  // --------------------------------------------------------------------------
  async initOfflineDownloads() {
    try {
      await this.offlineDb.init();
      await this.renderOfflineDownloads();
    } catch (err) {
      console.warn('Offline DB init error:', err);
    }
  }

  openDownloadModal() {
    if (!this.player.currentVideoData) return;
    const v = this.player.currentVideoData;

    if (this.downloadPreviewThumb) this.downloadPreviewThumb.src = v.thumbnail || '';
    if (this.downloadPreviewTitle) this.downloadPreviewTitle.textContent = v.title || 'YouTube Video';
    if (this.downloadPreviewAuthor) this.downloadPreviewAuthor.textContent = v.author || 'YouTube Channel';

    if (this.downloadOptionsContainer) this.downloadOptionsContainer.classList.remove('hidden');
    if (this.downloadProgressBox) this.downloadProgressBox.classList.add('hidden');
    if (this.downloadModal) this.downloadModal.classList.remove('hidden');
  }

  async updateDownloadBtnState(videoId) {
    if (!this.downloadBtnText) return;
    try {
      const isDownloaded = await this.offlineDb.get(videoId);
      if (isDownloaded) {
        this.downloadBtnText.textContent = 'Downloaded ✓';
        this.downloadBtn.classList.add('downloaded');
      } else {
        this.downloadBtnText.textContent = 'Download';
        this.downloadBtn.classList.remove('downloaded');
      }
    } catch (e) {}
  }

  async executeDownload(type) {
    const video = this.player.currentVideoData;
    if (!video || !video.videoId) return;

    if (this.downloadOptionsContainer) this.downloadOptionsContainer.classList.add('hidden');
    if (this.downloadProgressBox) this.downloadProgressBox.classList.remove('hidden');
    if (this.dlStatusText) this.dlStatusText.textContent = `Downloading ${type === 'video' ? 'Video (MP4)' : 'Audio (M4A)'}...`;
    if (this.dlPercentText) this.dlPercentText.textContent = '0%';
    if (this.dlProgressBar) this.dlProgressBar.style.width = '0%';

    try {
      const url = `/api/download?id=${encodeURIComponent(video.videoId)}&type=${type}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Download request failed: HTTP ' + response.status);

      const contentLength = +response.headers.get('Content-Length') || 0;
      const reader = response.body.getReader();
      let receivedBytes = 0;
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        receivedBytes += value.length;
        if (contentLength > 0) {
          const percent = Math.min(100, Math.round((receivedBytes / contentLength) * 100));
          if (this.dlPercentText) this.dlPercentText.textContent = `${percent}%`;
          if (this.dlProgressBar) this.dlProgressBar.style.width = `${percent}%`;
        } else {
          const mb = (receivedBytes / (1024 * 1024)).toFixed(1);
          if (this.dlPercentText) this.dlPercentText.textContent = `${mb} MB`;
          if (this.dlProgressBar) this.dlProgressBar.style.width = '75%';
        }
      }

      if (this.dlStatusText) this.dlStatusText.textContent = 'Saving locally to device...';
      if (this.dlProgressBar) this.dlProgressBar.style.width = '100%';

      const mimeType = type === 'video' ? 'video/mp4' : 'audio/mp4';
      const blob = new Blob(chunks, { type: mimeType });

      // Save to IndexedDB
      const record = {
        videoId: video.videoId,
        title: video.title || 'YouTube Video',
        author: video.author || 'YouTube',
        thumbnail: video.thumbnail || `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
        duration: video.duration || '',
        type: type,
        blob: blob,
        size: blob.size,
        downloadedAt: Date.now()
      };
      await this.offlineDb.save(record);

      // Trigger native browser file download so file is stored in phone/PC file system
      try {
        const cleanName = (video.title || 'video').replace(/[/\\?%*:|"<>]/g, '_').trim().substring(0, 70);
        const filename = `${cleanName}.${type === 'video' ? 'mp4' : 'm4a'}`;
        const downloadLink = document.createElement('a');
        const blobUrl = URL.createObjectURL(blob);
        downloadLink.href = blobUrl;
        downloadLink.download = filename;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        setTimeout(() => {
          URL.revokeObjectURL(blobUrl);
          downloadLink.remove();
        }, 1500);
      } catch (dlErr) {
        console.warn('Native download link error:', dlErr);
      }

      this.updateDownloadBtnState(video.videoId);
      await this.renderOfflineDownloads();

      setTimeout(() => {
        if (this.downloadModal) this.downloadModal.classList.add('hidden');
        window.showToast(`✓ Downloaded ${type === 'video' ? 'Video' : 'Audio'}! Ready for offline play.`);
      }, 700);
    } catch (err) {
      console.error('Download error:', err);
      if (this.dlStatusText) this.dlStatusText.textContent = 'Download failed';
      if (this.downloadOptionsContainer) this.downloadOptionsContainer.classList.remove('hidden');
      if (this.downloadProgressBox) this.downloadProgressBox.classList.add('hidden');
      window.showToast('Download failed: ' + err.message);
    }
  }

  async renderOfflineDownloads() {
    if (!this.downloadsList) return;
    try {
      const list = await this.offlineDb.getAll();
      this.offlineDownloads = list;
      if (this.offlineBadgeCount) {
        this.offlineBadgeCount.textContent = `${list.length} item${list.length === 1 ? '' : 's'}`;
      }

      if (list.length === 0) {
        this.downloadsList.innerHTML = '<p class="empty-text">No offline videos yet. Tap "Download" on any video to play without internet!</p>';
        return;
      }

      this.downloadsList.innerHTML = list.map(item => {
        const sizeMb = (item.size / (1024 * 1024)).toFixed(1);
        const isVideo = item.type === 'video';
        return `
          <div class="download-item-card" data-id="${item.videoId}">
            <div class="download-item-thumb-wrap">
              <img src="${item.thumbnail}" alt="${this.escapeHtml(item.title)}" class="download-item-thumb" loading="lazy">
              <span class="badge-offline-type">${isVideo ? '🎬 VIDEO' : '🎵 AUDIO'}</span>
            </div>
            <div class="download-item-meta">
              <h4 class="download-item-title">${this.escapeHtml(item.title)}</h4>
              <p class="download-item-sub">
                <span class="badge-offline-ready">✓ Offline Ready</span> • ${sizeMb} MB
              </p>
            </div>
            <div class="download-item-actions">
              <button class="btn-item-action btn-save-device" data-id="${item.videoId}" title="Save to Device File">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
                </svg>
              </button>
              <button class="btn-item-action btn-delete-dl" data-id="${item.videoId}" title="Delete from Offline Storage">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
              </button>
            </div>
          </div>
        `;
      }).join('');

      // Play click handler
      this.downloadsList.querySelectorAll('.download-item-card').forEach(card => {
        card.addEventListener('click', async (e) => {
          if (e.target.closest('.btn-item-action')) return;
          const id = card.dataset.id;
          const record = await this.offlineDb.get(id);
          if (record) {
            this.openOfflineMedia(record);
          }
        });
      });

      // Delete handler
      this.downloadsList.querySelectorAll('.btn-delete-dl').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.id;
          if (confirm('Delete this download from offline storage?')) {
            await this.offlineDb.delete(id);
            if (this.player.currentVideoData?.videoId === id) {
              this.updateDownloadBtnState(id);
            }
            this.renderOfflineDownloads();
            window.showToast('Removed from offline downloads');
          }
        });
      });

      // Save to device file handler
      this.downloadsList.querySelectorAll('.btn-save-device').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.id;
          const record = await this.offlineDb.get(id);
          if (record) {
            const cleanName = (record.title || 'video').replace(/[/\\?%*:|"<>]/g, '_').trim().substring(0, 70);
            const filename = `${cleanName}.${record.type === 'video' ? 'mp4' : 'm4a'}`;
            const a = document.createElement('a');
            const blobUrl = URL.createObjectURL(record.blob);
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { URL.revokeObjectURL(blobUrl); a.remove(); }, 1500);
            window.showToast('Saved file to device storage!');
          }
        });
      });
    } catch (e) {
      console.warn('Render offline downloads error:', e);
    }
  }

  openOfflineMedia(record) {
    window.hideMiniPlayer();
    this.watchModal.classList.remove('hidden');
    document.getElementById('watchScroll').scrollTo({ top: 0, behavior: 'instant' });

    this.watchTitle.textContent = record.title || 'Offline Video';
    this.watchViews.textContent = '📶 Offline Local Playback';
    this.watchDate.textContent = 'Zero Internet ✓';
    this.channelName.textContent = record.author || 'Offline Media';
    this.channelSubs.textContent = '';
    this.descriptionText.textContent = `Playing from local offline device storage. Zero data used.`;
    this.channelAvatar.src = record.thumbnail || '/icons/icon-192.png';

    this.updateDownloadBtnState(record.videoId);
    this.updateSaveButtonState(record.videoId);

    this.player.playOfflineMedia(record);
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
