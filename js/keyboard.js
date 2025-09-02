const KeyboardManager = {
  init() {
    this.setupKeyboardShortcuts();
    this.setupAccessibility();
  },

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ignore if user is typing in search
      if (document.activeElement.id === 'location-search') {
        // Allow Escape to clear/blur search
        if (e.key === 'Escape') {
          document.getElementById('location-search').value = '';
          document.getElementById('location-search').blur();
          LocationManager.hideSearchResults();
        }
        return;
      }

      // Global shortcuts
      switch (e.key.toLowerCase()) {
        case '/':
        case 's':
          // Focus search with / or s
          e.preventDefault();
          document.getElementById('location-search').focus();
          break;

        case 'l':
          // Use current location with 'l'
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            document.getElementById('use-my-location').click();
          }
          break;

        case 'c':
          // Clear all locations with 'c'
          if (e.shiftKey) {
            e.preventDefault();
            this.clearAllLocations();
          }
          break;

        case '1':
        case '2':
        case '3':
          // Quick switch between locations with number keys
          if (!e.metaKey && !e.ctrlKey) {
            const index = parseInt(e.key) - 1;
            if (LocationManager.locations[index]) {
              LocationManager.setPrimary(index);
            }
          }
          break;

        case 'arrowleft':
        case 'arrowright':
          // Navigate through time with arrow keys
          if (e.shiftKey) {
            e.preventDefault();
            this.shiftTimeView(e.key === 'arrowleft' ? -30 : 30);
          }
          break;

        case '?':
          // Show help with '?'
          if (e.shiftKey) {
            e.preventDefault();
            this.showKeyboardHelp();
          }
          break;

        case 'p':
          // Print view with 'p'
          if (e.ctrlKey || e.metaKey) {
            // Browser handles Ctrl+P
          } else if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            this.togglePrintView();
          }
          break;

        case 'escape':
          // Close any open modals/tooltips
          this.closeAll();
          break;
      }

      // Cmd/Ctrl + S to share
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        this.shareCurrentView();
      }
    });
  },

  setupAccessibility() {
    // Add ARIA labels
    document
      .getElementById('location-search')
      .setAttribute('aria-label', 'Search for location');
    document
      .getElementById('use-my-location')
      .setAttribute('aria-label', 'Use current location');

    // Make location chips keyboard navigable
    this.updateChipAccessibility();
  },

  updateChipAccessibility() {
    document.querySelectorAll('.location-chip').forEach((chip, index) => {
      chip.setAttribute('tabindex', '0');
      chip.setAttribute('role', 'button');
      chip.setAttribute(
        'aria-label',
        `Location ${index + 1}: ${chip.querySelector('.chip-name').textContent}`
      );

      chip.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          chip.click();
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          const removeBtn = chip.querySelector('.chip-remove');
          if (removeBtn) removeBtn.click();
        }
      });
    });
  },

  clearAllLocations() {
    if (confirm('Clear all locations?')) {
      while (LocationManager.locations.length > 0) {
        LocationManager.removeLocation(0);
      }
      LocationManager.addDefaultLocation();
    }
  },

  shiftTimeView(days) {
    // This would require refactoring the date calculation
    // For now, just log the intent
    console.log(`Shift view by ${days} days`);
  },

  showKeyboardHelp() {
    const helpContent = `
            <div class="keyboard-help-modal">
                <div class="modal-content">
                    <h2>Keyboard Shortcuts</h2>
                    <button class="close-modal" onclick="KeyboardManager.closeAll()">×</button>
                    
                    <div class="shortcuts-grid">
                        <div class="shortcut-section">
                            <h3>Navigation</h3>
                            <div class="shortcut"><kbd>/</kbd> or <kbd>S</kbd> <span>Search locations</span></div>
                            <div class="shortcut"><kbd>L</kbd> <span>Use current location</span></div>
                            <div class="shortcut"><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <span>Switch between locations</span></div>
                            <div class="shortcut"><kbd>Esc</kbd> <span>Close search/modals</span></div>
                        </div>
                        
                        <div class="shortcut-section">
                            <h3>Actions</h3>
                            <div class="shortcut"><kbd>Shift</kbd> + <kbd>C</kbd> <span>Clear all locations</span></div>
                            <div class="shortcut"><kbd>Cmd/Ctrl</kbd> + <kbd>S</kbd> <span>Share current view</span></div>
                            <div class="shortcut"><kbd>P</kbd> <span>Print view</span></div>
                            <div class="shortcut"><kbd>?</kbd> <span>Show this help</span></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

    const modal = document.createElement('div');
    modal.innerHTML = helpContent;
    document.body.appendChild(modal);
  },

  closeAll() {
    // Close help modal
    const modal = document.querySelector('.keyboard-help-modal');
    if (modal) modal.remove();

    // Hide search results
    LocationManager.hideSearchResults();

    // Blur active element
    document.activeElement.blur();
  },

  togglePrintView() {
    document.body.classList.toggle('print-view');
    if (document.body.classList.contains('print-view')) {
      window.print();
      setTimeout(() => {
        document.body.classList.remove('print-view');
      }, 100);
    }
  },

  shareCurrentView() {
    // Generate shareable URL
    const locations = LocationManager.locations.map((loc) => ({
      n: loc.name,
      la: loc.lat.toFixed(4),
      ln: loc.lng.toFixed(4),
      p: loc.isPrimary ? 1 : 0,
    }));

    const params = new URLSearchParams({
      locs: JSON.stringify(locations),
    });

    const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;

    // Copy to clipboard
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => {
        this.showNotification('Link copied to clipboard!');
      })
      .catch(() => {
        // Fallback
        prompt('Share this link:', shareUrl);
      });
  },

  showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('show');
    }, 10);

    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  },
};

window.KeyboardManager = KeyboardManager;
