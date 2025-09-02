const ErrorHandler = {
  init() {
    this.setupGlobalErrorHandling();
    this.setupOfflineDetection();
  },

  setupGlobalErrorHandling() {
    window.addEventListener('error', (event) => {
      console.error('Global error:', event.error);
      this.showError('An unexpected error occurred. Please refresh the page.');
    });

    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      this.showError('An error occurred while processing your request.');
    });
  },

  setupOfflineDetection() {
    // Check initial state
    this.updateOnlineStatus();

    window.addEventListener('online', () => {
      this.updateOnlineStatus();
      this.showNotification('Connection restored', 'success');
    });

    window.addEventListener('offline', () => {
      this.updateOnlineStatus();
      this.showNotification(
        'No internet connection - Some features may be limited',
        'warning'
      );
    });
  },

  updateOnlineStatus() {
    if (!navigator.onLine) {
      document.body.classList.add('offline');
      this.disableOnlineFeatures();
    } else {
      document.body.classList.remove('offline');
      this.enableOnlineFeatures();
    }
  },

  disableOnlineFeatures() {
    // Disable location search when offline
    const searchInput = document.getElementById('location-search');
    if (searchInput) {
      searchInput.placeholder = 'Search unavailable offline';
      searchInput.disabled = true;
    }

    const useLocationBtn = document.getElementById('use-my-location');
    if (useLocationBtn) {
      useLocationBtn.disabled = true;
      useLocationBtn.title = 'Location services unavailable offline';
    }
  },

  enableOnlineFeatures() {
    const searchInput = document.getElementById('location-search');
    if (searchInput) {
      searchInput.placeholder = 'Search for a location...';
      searchInput.disabled = false;
    }

    const useLocationBtn = document.getElementById('use-my-location');
    if (useLocationBtn) {
      useLocationBtn.disabled = false;
      useLocationBtn.title = 'Use my location';
    }
  },

  showError(message, duration = 5000) {
    this.showNotification(message, 'error', duration);
  },

  showNotification(message, type = 'info', duration = 3000) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    // Add offline indicator
    if (!navigator.onLine && type !== 'warning') {
      const offlineTag = document.createElement('span');
      offlineTag.className = 'offline-tag';
      offlineTag.textContent = ' (Offline)';
      notification.appendChild(offlineTag);
    }

    setTimeout(() => {
      notification.classList.add('show');
    }, 10);

    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, duration);
  },

  handleLocationError(error) {
    let message = 'Unable to search for location';

    if (!navigator.onLine) {
      message = 'Location search requires internet connection';
    } else if (error.message.includes('rate limit')) {
      message = 'Too many requests. Please wait a moment and try again';
    } else if (error.message.includes('not found')) {
      message = 'Location not found. Try a different search';
    }

    this.showError(message);
  },

  handleDataError(error, location) {
    console.error('Data calculation error:', error);

    let message = `Unable to calculate daylight for ${location.name}`;

    if (Math.abs(location.lat) > 85) {
      message = 'Location is too close to the poles for accurate calculations';
    }

    this.showError(message);
  },
};

// Service Worker for offline support (only on HTTP/HTTPS)
if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
  // Use relative path that works everywhere
  navigator.serviceWorker.register('js/sw.js').catch((err) => {
    console.log('Service worker registration failed:', err);
  });
}

window.ErrorHandler = ErrorHandler;
