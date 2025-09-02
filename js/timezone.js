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
  async init() {
    // Check if GeoTZ is available
    if (typeof GeoTZ !== 'undefined') {
      // Test if GeoTZ actually works by making a test call
      try {
        // Test with a known location (Greenwich, UK)
        const testResult = await GeoTZ.find(51.4778, 0.0);
        if (testResult && testResult.length > 0) {
          this.isGeoTzLoaded = true;
        } else {
          throw new Error('GeoTZ returned empty result');
        }
      } catch (error) {
        console.warn(
          'Timezone: GeoTZ test failed, will retry on actual requests:',
          error
        );
        // Don't set isGeoTzLoaded to false yet - we'll retry on actual requests
        this.isGeoTzLoaded = true; // Still try to use it
      }
    } else {
      console.warn(
        'Timezone: browser-geo-tz not loaded, using longitude-based fallback'
      );
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
   * Get timezone using browser-geo-tz library with retry logic
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @returns {Promise<Object>} Timezone info
   */
  async getTimezoneFromGeoTz(lat, lng) {
    let lastError;

    // Try up to 3 times with exponential backoff
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
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
          source: 'geo-tz',
        };
      } catch (error) {
        lastError = error;
        console.warn(`Timezone: GeoTZ attempt ${attempt} failed:`, error);

        if (attempt < 3) {
          // Wait before retry (100ms, 200ms)
          await new Promise((resolve) => setTimeout(resolve, attempt * 100));
        }
      }
    }

    // All attempts failed
    throw lastError;
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
      source: 'fallback',
    };
  },

  /**
   * Get the current UTC offset in hours for a timezone name
   * @param {string} timezoneName - IANA timezone name
   * @returns {number} Offset in hours
   */
  getTimezoneOffsetHours(timezoneName) {
    try {
      // Create a reference date
      const now = new Date();

      // Get just the hours in both timezones
      const tzTimeString = now.toLocaleString('en-US', {
        timeZone: timezoneName,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const tzHours = parseInt(tzTimeString.split(':')[0]);

      const utcTimeString = now.toLocaleString('en-US', {
        timeZone: 'UTC',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const utcHours = parseInt(utcTimeString.split(':')[0]);

      // Get the dates to check for day boundary
      const tzDay = parseInt(
        now.toLocaleString('en-US', {
          timeZone: timezoneName,
          day: 'numeric',
        })
      );

      const utcDay = parseInt(
        now.toLocaleString('en-US', {
          timeZone: 'UTC',
          day: 'numeric',
        })
      );

      // Calculate offset
      let offset = tzHours - utcHours;

      // Handle day boundary crossing
      if (tzDay > utcDay) {
        offset += 24;
      } else if (tzDay < utcDay) {
        offset -= 24;
      }

      // Normalize to standard range
      if (offset > 14) {
        offset -= 24;
      }
      if (offset < -12) {
        offset += 24;
      }

      return offset;
    } catch (error) {
      console.error(
        'Timezone: Error calculating offset for',
        timezoneName,
        error
      );
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
      timestamp: Date.now(),
    });
  },
};

// Export to window for use in other modules
window.TimezoneManager = TimezoneManager;
