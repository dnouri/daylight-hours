const LocationManager = {
    MAX_LOCATIONS: 3,
    locations: [],
    searchTimeout: null,
    recentLocations: [],
    
    init() {
        // Initialize TimezoneManager first
        if (window.TimezoneManager) {
            window.TimezoneManager.init();
        }
        
        this.loadRecentLocations();
        this.loadActiveLocations();
        this.setupEventListeners();
        
        // Only add default location if no saved locations exist
        if (this.locations.length === 0) {
            this.addDefaultLocation();
        }
    },
    
    async addDefaultLocation() {
        const location = {
            name: 'New York, NY',
            lat: 40.7128,
            lng: -74.0060,
            isPrimary: true
        };
        
        // Get accurate timezone for default location
        if (window.TimezoneManager) {
            try {
                const tzInfo = await window.TimezoneManager.getTimezone(location.lat, location.lng);
                location.timezoneOffset = tzInfo.offsetHours;
                location.timezoneName = tzInfo.name;
                location.timezoneSource = tzInfo.source;
            } catch (error) {
                console.error('Failed to get timezone for default location:', error);
                location.timezoneOffset = -5; // Fallback for NYC
            }
        } else {
            location.timezoneOffset = -5; // Fallback
        }
        
        this.addLocation(location, false); // Don't save to localStorage on initial default
    },
    
    loadActiveLocations() {
        try {
            const saved = localStorage.getItem('activeLocations');
            if (saved) {
                const locations = JSON.parse(saved);
                if (Array.isArray(locations) && locations.length > 0) {
                    this.locations = locations;
                    // Reassign color indices based on position
                    this.locations.forEach((loc, index) => {
                        loc.colorIndex = index;
                    });
                    this.renderLocationChips();
                    this.updateChart();
                }
            }
        } catch (error) {
            console.error('Failed to load active locations:', error);
        }
    },
    
    saveActiveLocations() {
        try {
            localStorage.setItem('activeLocations', JSON.stringify(this.locations));
        } catch (error) {
            console.error('Failed to save active locations:', error);
        }
    },
    
    setupEventListeners() {
        const searchInput = document.getElementById('location-search');
        const useMyLocation = document.getElementById('use-my-location');
        
        searchInput.addEventListener('input', (e) => {
            clearTimeout(this.searchTimeout);
            const query = e.target.value.trim();
            
            if (query.length < 2) {
                this.hideSearchResults();
                return;
            }
            
            this.searchTimeout = setTimeout(() => {
                this.searchLocation(query);
            }, 300);
        });
        
        searchInput.addEventListener('focus', () => {
            if (searchInput.value.length >= 2) {
                document.getElementById('search-results').style.display = 'block';
            }
        });
        
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container')) {
                this.hideSearchResults();
            }
        });
        
        useMyLocation.addEventListener('click', () => {
            this.getUserLocation();
        });
    },
    
    async searchLocation(query) {
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`
            );
            const results = await response.json();
            this.displaySearchResults(results);
        } catch (error) {
            console.error('Search failed:', error);
        }
    },
    
    displaySearchResults(results) {
        const container = document.getElementById('search-results');
        
        if (results.length === 0) {
            container.innerHTML = '<div class="search-result-item">No results found</div>';
            container.style.display = 'block';
            return;
        }
        
        container.innerHTML = results.map(result => `
            <div class="search-result-item" data-lat="${result.lat}" data-lng="${result.lon}" data-name="${result.display_name}">
                <span class="result-name">${result.display_name.split(',').slice(0, 3).join(',')}</span>
            </div>
        `).join('');
        
        container.style.display = 'block';
        
        container.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', async () => {
                const lat = parseFloat(item.dataset.lat);
                const lng = parseFloat(item.dataset.lng);
                const name = item.dataset.name.split(',').slice(0, 2).join(',');
                
                const locationData = { name, lat, lng };
                
                // Show loading indicator
                item.classList.add('loading');
                item.style.pointerEvents = 'none';
                
                // Get accurate timezone
                if (window.TimezoneManager) {
                    try {
                        const tzInfo = await window.TimezoneManager.getTimezone(lat, lng);
                        locationData.timezoneOffset = tzInfo.offsetHours;
                        locationData.timezoneName = tzInfo.name;
                        locationData.timezoneSource = tzInfo.source;
                    } catch (error) {
                        console.error('Failed to get timezone:', error);
                        // Fallback to longitude-based calculation
                        locationData.timezoneOffset = Math.round(lng / 15);
                        locationData.timezoneSource = 'fallback';
                    }
                } else {
                    // Fallback if TimezoneManager not available
                    locationData.timezoneOffset = Math.round(lng / 15);
                    locationData.timezoneSource = 'fallback';
                }
                
                this.addLocation(locationData);
                this.hideSearchResults();
                document.getElementById('location-search').value = '';
            });
        });
    },
    
    hideSearchResults() {
        document.getElementById('search-results').style.display = 'none';
    },
    
    getUserLocation() {
        if (!navigator.geolocation) {
            alert('Geolocation is not supported by your browser');
            return;
        }
        
        const btn = document.getElementById('use-my-location');
        btn.disabled = true;
        btn.textContent = '⏳';
        
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                
                let locationData = {
                    lat: latitude,
                    lng: longitude
                };
                
                // Get location name from reverse geocoding
                try {
                    const response = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
                    );
                    const data = await response.json();
                    const name = data.address.city || data.address.town || data.address.village || 'Current Location';
                    locationData.name = `${name}, ${data.address.country}`;
                } catch (error) {
                    locationData.name = 'Current Location';
                }
                
                // Get accurate timezone
                if (window.TimezoneManager) {
                    try {
                        const tzInfo = await window.TimezoneManager.getTimezone(latitude, longitude);
                        locationData.timezoneOffset = tzInfo.offsetHours;
                        locationData.timezoneName = tzInfo.name;
                        locationData.timezoneSource = tzInfo.source;
                    } catch (error) {
                        console.error('Failed to get timezone:', error);
                        locationData.timezoneOffset = Math.round(longitude / 15);
                        locationData.timezoneSource = 'fallback';
                    }
                } else {
                    locationData.timezoneOffset = Math.round(longitude / 15);
                    locationData.timezoneSource = 'fallback';
                }
                
                this.addLocation(locationData);
                
                btn.disabled = false;
                btn.textContent = '📍';
            },
            (error) => {
                alert('Unable to get your location');
                btn.disabled = false;
                btn.textContent = '📍';
            }
        );
    },
    
    addLocation(location, shouldSave = true) {
        if (this.locations.length >= this.MAX_LOCATIONS) {
            this.locations.pop();
        }
        
        const exists = this.locations.find(loc => 
            loc.lat === location.lat && loc.lng === location.lng
        );
        
        if (exists) return;
        
        if (this.locations.length === 0) {
            location.isPrimary = true;
        }
        
        this.locations.unshift(location);
        
        // Reassign color indices based on position
        this.locations.forEach((loc, index) => {
            loc.colorIndex = index;
        });
        
        this.saveToRecent(location);
        this.renderLocationChips();
        this.updateChart();
        
        if (shouldSave) {
            this.saveActiveLocations();
        }
    },
    
    removeLocation(index) {
        this.locations.splice(index, 1);
        
        if (this.locations.length > 0 && index === 0) {
            this.locations[0].isPrimary = true;
        }
        
        // Reassign color indices after removal
        this.locations.forEach((loc, i) => {
            loc.colorIndex = i;
        });
        
        this.renderLocationChips();
        this.updateChart();
        
        // Only save if there are locations left, otherwise clear storage
        if (this.locations.length > 0) {
            this.saveActiveLocations();
        } else {
            localStorage.removeItem('activeLocations');
        }
    },
    
    renderLocationChips() {
        const container = document.getElementById('location-chips');
        
        if (this.locations.length === 0) {
            container.innerHTML = '';
            return;
        }
        
        // Get colors from App
        const colors = window.App ? window.App.locationColors : ['#2196F3', '#4CAF50', '#FF9800'];
        
        container.innerHTML = this.locations.map((loc, index) => {
            const color = colors[loc.colorIndex || 0];
            // Convert hex to rgba for translucent background
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            
            const bgColor = `rgba(${r}, ${g}, ${b}, 0.2)`;
            const borderColor = `rgba(${r}, ${g}, ${b}, 0.5)`;
            
            // Add warning icon if using fallback timezone
            const tzWarning = loc.timezoneSource === 'fallback' ? 
                '<span class="chip-warning" title="Using approximate timezone">⚠️</span>' : '';
            
            return `
                <div class="location-chip ${loc.isPrimary ? 'primary' : ''}" 
                     data-index="${index}"
                     style="background: ${bgColor}; border-color: ${borderColor};"
                     title="${loc.timezoneName || `UTC${loc.timezoneOffset >= 0 ? '+' : ''}${loc.timezoneOffset}`}">
                    <span class="chip-name">${loc.name}</span>
                    ${tzWarning}
                    ${this.locations.length > 1 ? `<span class="chip-remove" data-index="${index}">×</span>` : ''}
                </div>
            `;
        }).join('');
        
        container.querySelectorAll('.chip-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeLocation(parseInt(btn.dataset.index));
            });
        });
        
        container.querySelectorAll('.location-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const index = parseInt(chip.dataset.index);
                this.setPrimary(index);
            });
        });
    },
    
    setPrimary(index) {
        this.locations.forEach((loc, i) => {
            loc.isPrimary = i === index;
        });
        this.renderLocationChips();
        this.updateChart();
        this.saveActiveLocations();
    },
    
    updateChart() {
        if (window.App) {
            window.App.updateLocations(this.locations);
        }
    },
    
    saveToRecent(location) {
        this.recentLocations = this.recentLocations.filter(loc => 
            !(loc.lat === location.lat && loc.lng === location.lng)
        );
        
        this.recentLocations.unshift(location);
        this.recentLocations = this.recentLocations.slice(0, 10);
        
        localStorage.setItem('recentLocations', JSON.stringify(this.recentLocations));
    },
    
    loadRecentLocations() {
        try {
            const saved = localStorage.getItem('recentLocations');
            if (saved) {
                this.recentLocations = JSON.parse(saved);
            }
        } catch (error) {
            console.error('Failed to load recent locations:', error);
        }
    }
};

window.LocationManager = LocationManager;