/**
 * Timezone utility module for accurate timezone detection
 * Uses browser-geo-tz for coordinate-based timezone lookup
 * Falls back to simple longitude-based calculation if library unavailable
 */

const TimezoneManager = {
    // Cache for timezone lookups to minimize repeated calculations
    cache: new Map(),
    
    // Maximum cache size before cleanup
    MAX_CACHE_SIZE: 100,
    
    // Cache duration in milliseconds (24 hours)
    CACHE_DURATION: 24 * 60 * 60 * 1000,
    
    // Track if browser-geo-tz is loaded
    isGeoTzLoaded: false,
    
    /**
     * Initialize the timezone manager
     */
    init() {
        // Check if GeoTZ is available
        if (typeof GeoTZ !== 'undefined') {
            this.isGeoTzLoaded = true;
            console.log('Timezone: browser-geo-tz loaded successfully');
        } else {
            console.warn('Timezone: browser-geo-tz not loaded, using longitude-based fallback');
        }
    },
    
    /**
     * Get timezone information for given coordinates
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @returns {Promise<Object>} Timezone info with offset and name
     */
    async getTimezone(lat, lng) {
        // Round coordinates for cache key (4 decimal places is ~11m precision)
        const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
        
        // Check cache first
        const cached = this.getFromCache(cacheKey);
        if (cached) {
            return cached;
        }
        
        let timezoneInfo;
        
        if (this.isGeoTzLoaded && typeof GeoTZ !== 'undefined') {
            try {
                // Use browser-geo-tz for accurate timezone
                timezoneInfo = await this.getTimezoneFromGeoTz(lat, lng);
            } catch (error) {
                console.error('Timezone: GeoTZ failed, using fallback:', error);
                timezoneInfo = this.getSimpleFallback(lat, lng);
            }
        } else {
            // Use simple fallback if library not loaded
            timezoneInfo = this.getSimpleFallback(lat, lng);
        }
        
        // Cache the result
        this.addToCache(cacheKey, timezoneInfo);
        
        return timezoneInfo;
    },
    
    /**
     * Get timezone using browser-geo-tz library
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @returns {Promise<Object>} Timezone info
     */
    async getTimezoneFromGeoTz(lat, lng) {
        // GeoTZ.find returns an array of timezone names
        const timezones = await GeoTZ.find(lat, lng);
        
        if (!timezones || timezones.length === 0) {
            throw new Error('No timezone found for coordinates');
        }
        
        // Use the first timezone (most specific)
        const timezoneName = timezones[0];
        
        // Calculate current offset for this timezone
        const offsetHours = this.getTimezoneOffsetHours(timezoneName);
        
        return {
            name: timezoneName,
            offsetHours: offsetHours,
            source: 'geo-tz'
        };
    },
    
    /**
     * Simple fallback using longitude-based calculation
     * This is the original calculation method
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @returns {Object} Timezone info
     */
    getSimpleFallback(lat, lng) {
        // Simple longitude-based calculation (15° = 1 hour)
        const offsetHours = Math.round(lng / 15);
        
        return {
            name: `UTC${offsetHours >= 0 ? '+' : ''}${offsetHours}`,
            offsetHours: offsetHours,
            source: 'fallback'
        };
    },
    
    /**
     * Get the current UTC offset in hours for a timezone name
     * @param {string} timezoneName - IANA timezone name
     * @returns {number} Offset in hours
     */
    getTimezoneOffsetHours(timezoneName) {
        try {
            // Create dates to compare
            const now = new Date();
            
            // Get a date string in the target timezone
            const tzDateString = now.toLocaleString('en-US', { 
                timeZone: timezoneName,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
            
            // Get the same instant in UTC
            const utcDateString = now.toLocaleString('en-US', { 
                timeZone: 'UTC',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
            
            // Parse both dates
            const tzDate = new Date(tzDateString);
            const utcDate = new Date(utcDateString);
            
            // Calculate difference in hours
            const diffMs = tzDate - utcDate;
            const diffHours = Math.round(diffMs / (1000 * 60 * 60));
            
            return diffHours;
        } catch (error) {
            console.error('Timezone: Error calculating offset for', timezoneName, error);
            // If we can't calculate, return 0
            return 0;
        }
    },
    
    /**
     * Get from cache if valid
     * @param {string} key - Cache key
     * @returns {Object|null} Cached timezone info or null
     */
    getFromCache(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;
        
        // Check if cache is still valid
        if (Date.now() - cached.timestamp > this.CACHE_DURATION) {
            this.cache.delete(key);
            return null;
        }
        
        return cached.data;
    },
    
    /**
     * Add to cache with timestamp
     * @param {string} key - Cache key
     * @param {Object} data - Timezone data to cache
     */
    addToCache(key, data) {
        // Clean up cache if it's too large
        if (this.cache.size >= this.MAX_CACHE_SIZE) {
            // Remove oldest entries
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        
        this.cache.set(key, {
            data: data,
            timestamp: Date.now()
        });
    }
};

// Export to window for use in other modules
window.TimezoneManager = TimezoneManager;