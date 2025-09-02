const App = {
    locations: [],
    locationColors: ['#2196F3', '#4CAF50', '#FF9800'],
    dataCache: new Map(),
    tooltip: null,
    currentHoverPoint: null,
    hideTooltipTimer: null,
    isMobile: false,
    selectedDayData: null,
    selectedDayLine: null,
    bottomSheet: null,
    
    init() {
        this.detectMobile();
        this.setupTooltip();
        this.setupBottomSheet();
        this.updateDateDisplay();
        this.setupEventListeners();
        this.loadFromURL();
        window.LocationManager.init();
        window.KeyboardManager.init();
        window.ErrorHandler.init();
    },
    
    detectMobile() {
        // Detect mobile based on viewport width
        this.isMobile = window.innerWidth <= 768;
        
        // Update on resize
        window.addEventListener('resize', () => {
            const wasMobile = this.isMobile;
            this.isMobile = window.innerWidth <= 768;
            
            // Clean up if switching modes
            if (wasMobile !== this.isMobile) {
                this.hideTooltip();
                this.hideBottomSheet();
                this.clearSelectedDay();
            }
        });
    },
    
    setupTooltip() {
        // Create a single reusable tooltip
        if (!this.tooltip) {
            this.tooltip = d3.select('body').append('div')
                .attr('class', 'chart-tooltip')
                .style('opacity', 0)
                .style('pointer-events', 'none');
        }
    },
    
    setupBottomSheet() {
        this.bottomSheet = document.getElementById('mobile-bottom-sheet');
        const closeBtn = this.bottomSheet.querySelector('.bottom-sheet-close');
        const handle = this.bottomSheet.querySelector('.bottom-sheet-handle');
        
        // Close button handler
        closeBtn.addEventListener('click', () => this.hideBottomSheet());
        
        // Handle drag to close
        let startY = 0;
        let currentY = 0;
        let isDragging = false;
        
        const startDrag = (e) => {
            isDragging = true;
            startY = e.touches ? e.touches[0].clientY : e.clientY;
            this.bottomSheet.style.transition = 'none';
        };
        
        const drag = (e) => {
            if (!isDragging) return;
            currentY = e.touches ? e.touches[0].clientY : e.clientY;
            const deltaY = Math.max(0, currentY - startY);
            this.bottomSheet.style.transform = `translateY(${deltaY}px)`;
        };
        
        const endDrag = () => {
            if (!isDragging) return;
            isDragging = false;
            this.bottomSheet.style.transition = '';
            this.bottomSheet.style.transform = '';
            
            const deltaY = currentY - startY;
            if (deltaY > 50) { // Threshold for closing
                this.hideBottomSheet();
            }
        };
        
        handle.addEventListener('touchstart', startDrag);
        handle.addEventListener('touchmove', drag);
        handle.addEventListener('touchend', endDrag);
        handle.addEventListener('mousedown', startDrag);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', endDrag);
        
        // Tap outside to close
        this.bottomSheet.addEventListener('click', (e) => {
            if (e.target === this.bottomSheet) {
                this.hideBottomSheet();
            }
        });
    },
    
    showBottomSheet(dataPoint, allLocationData) {
        if (!this.isMobile) return;
        
        // Add class to body for split view
        document.body.classList.add('sheet-open');
        
        this.bottomSheet.classList.add('visible');
        setTimeout(() => {
            this.bottomSheet.classList.add('active');
            
            // Ensure the selected point on the chart is visible above the sheet
            this.ensureChartVisible();
        }, 10);
        
        // Update content
        const dateEl = this.bottomSheet.querySelector('.bottom-sheet-date');
        const locationsEl = this.bottomSheet.querySelector('.bottom-sheet-locations');
        
        dateEl.textContent = this.formatDateShort(dataPoint.date);
        
        // On mobile, only show the primary location (the one selected)
        // This matches the desktop behavior where stats card shows primary location
        const primaryLocation = allLocationData.find(item => item.location.isPrimary);
        const dataToShow = primaryLocation ? [primaryLocation] : allLocationData;
        
        // Build location details
        let locationsHTML = '';
        dataToShow.forEach(item => {
            const isPrimary = item.location.isPrimary;
            const offset = item.location.timezoneOffset || 0;
            
            locationsHTML += `
                <div class="bottom-sheet-location">
                    <div class="bottom-sheet-location-name" style="border-left-color: ${item.color}">
                        ${item.location.name.split(',')[0]}
                    </div>
                    <div class="bottom-sheet-location-info">
                        <div class="bottom-sheet-stat">
                            <span class="bottom-sheet-stat-label">Sunrise</span>
                            <span class="bottom-sheet-stat-value">
                                ${item.data.sunrise ? this.formatTime(item.data.sunrise, offset) : 'N/A'}
                            </span>
                        </div>
                        <div class="bottom-sheet-stat">
                            <span class="bottom-sheet-stat-label">Sunset</span>
                            <span class="bottom-sheet-stat-value">
                                ${item.data.sunset ? this.formatTime(item.data.sunset, offset) : 'N/A'}
                            </span>
                        </div>
                        <div class="bottom-sheet-stat">
                            <span class="bottom-sheet-stat-label">Daylight</span>
                            <span class="bottom-sheet-stat-value">
                                ${this.formatDuration(item.data.daylight)}
                            </span>
                        </div>
                        <div class="bottom-sheet-stat">
                            <span class="bottom-sheet-stat-label">Solar Noon</span>
                            <span class="bottom-sheet-stat-value">
                                ${this.formatTime(item.data.solarNoon, offset)} (${item.data.maxAltitude.toFixed(1)}°)
                            </span>
                        </div>
                        <div class="bottom-sheet-stat">
                            <span class="bottom-sheet-stat-label">Sun at 9am</span>
                            <span class="bottom-sheet-stat-value">
                                ${item.data.altitude9am.toFixed(1)}°
                            </span>
                        </div>
                        <div class="bottom-sheet-stat">
                            <span class="bottom-sheet-stat-label">Sun at 3pm</span>
                            <span class="bottom-sheet-stat-value">
                                ${item.data.altitude3pm.toFixed(1)}°
                            </span>
                        </div>
                    </div>
                </div>
            `;
        });
        
        locationsEl.innerHTML = locationsHTML;
    },
    
    hideBottomSheet() {
        if (!this.bottomSheet) return;
        
        // Remove sheet-open class from body
        document.body.classList.remove('sheet-open');
        
        this.bottomSheet.classList.remove('active');
        setTimeout(() => {
            this.bottomSheet.classList.remove('visible');
        }, 300);
        
        this.clearSelectedDay();
    },
    
    clearSelectedDay() {
        // Remove selected day line from charts
        if (this.selectedDayLine) {
            d3.selectAll('.selected-day-line').remove();
            this.selectedDayLine = null;
        }
        this.selectedDayData = null;
    },
    
    ensureChartVisible() {
        // Calculate positions
        const sheetHeight = Math.min(280, window.innerHeight * 0.4);
        const viewportHeight = window.innerHeight;
        const chartsContainer = document.querySelector('.charts-wrapper');
        
        if (!chartsContainer) return;
        
        const chartsRect = chartsContainer.getBoundingClientRect();
        const chartBottom = chartsRect.bottom;
        const availableSpace = viewportHeight - sheetHeight;
        
        // If the chart extends below where the sheet will be, scroll up
        if (chartBottom > availableSpace) {
            // Calculate how much to scroll
            // We want the chart container to be fully visible above the sheet
            const targetTop = Math.max(0, chartsRect.top - (chartBottom - availableSpace) - 20);
            
            window.scrollTo({
                top: window.scrollY + targetTop,
                behavior: 'smooth'
            });
        }
        
        // If the chart is above the viewport after focusing on selected day, scroll down
        if (chartsRect.top < 0) {
            window.scrollTo({
                top: window.scrollY + chartsRect.top - 20,
                behavior: 'smooth'
            });
        }
    },
    
    showSelectedDayLine(dataPoint, datasets, xScale, g) {
        // Clear existing selected day line
        this.clearSelectedDay();
        
        // Add selected day line to daylight chart
        const chartHeight = g.node().getBBox().height;
        this.selectedDayLine = g.append('line')
            .attr('class', 'selected-day-line')
            .attr('x1', xScale(dataPoint.date))
            .attr('x2', xScale(dataPoint.date))
            .attr('y1', 0)
            .attr('y2', chartHeight);
        
        // Also add to altitude chart if it exists
        const altitudeChart = d3.select('#altitude-chart');
        if (!altitudeChart.empty()) {
            const altitudeSvg = altitudeChart.select('g');
            if (!altitudeSvg.empty()) {
                const altitudeHeight = altitudeSvg.node().getBBox().height;
                altitudeSvg.append('line')
                    .attr('class', 'selected-day-line')
                    .attr('x1', xScale(dataPoint.date))
                    .attr('x2', xScale(dataPoint.date))
                    .attr('y1', 0)
                    .attr('y2', altitudeHeight);
            }
        }
        
        this.selectedDayData = dataPoint;
    },
    
    loadFromURL() {
        const params = new URLSearchParams(window.location.search);
        const locsParam = params.get('locs');
        
        if (locsParam) {
            try {
                const locations = JSON.parse(locsParam);
                if (Array.isArray(locations)) {
                    // Clear default and load from URL
                    LocationManager.locations = [];
                    
                    locations.forEach(loc => {
                        LocationManager.addLocation({
                            name: loc.n,
                            lat: parseFloat(loc.la),
                            lng: parseFloat(loc.ln),
                            isPrimary: loc.p === 1
                        }, false);
                    });
                    
                    // Clear URL params after loading
                    window.history.replaceState({}, document.title, window.location.pathname);
                }
            } catch (error) {
                console.error('Failed to load locations from URL:', error);
            }
        }
    },
    
    updateLocations(locations) {
        this.locations = locations;
        this.calculateAndRenderData();
    },
    
    updateDateDisplay() {
        const today = new Date();
        const options = { month: 'long', day: 'numeric', year: 'numeric' };
        document.getElementById('today-date').textContent = today.toLocaleDateString('en-US', options);
    },
    
    calculateYearData(lat, lng) {
        // Check cache first
        const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
        if (this.dataCache.has(cacheKey)) {
            const cached = this.dataCache.get(cacheKey);
            // Cache is valid for 1 hour
            if (Date.now() - cached.timestamp < 3600000) {
                return cached.data;
            }
        }
        
        const data = [];
        const today = new Date();
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 182); // 6 months ago
        
        for (let i = 0; i < 365; i++) {
            const date = new Date(startDate);
            date.setDate(date.getDate() + i);
            
            const times = SunCalc.getTimes(date, lat, lng);
            const sunrise = times.sunrise;
            const sunset = times.sunset;
            
            // Calculate solar noon and maximum altitude
            const solarNoon = times.solarNoon;
            const noonPos = SunCalc.getPosition(solarNoon, lat, lng);
            const maxAltitude = noonPos.altitude * 180 / Math.PI; // Convert to degrees
            
            // Calculate sun positions at different times
            const morning9 = new Date(date);
            morning9.setHours(9, 0, 0, 0);
            const morning9Pos = SunCalc.getPosition(morning9, lat, lng);
            
            const afternoon3 = new Date(date);
            afternoon3.setHours(15, 0, 0, 0);
            const afternoon3Pos = SunCalc.getPosition(afternoon3, lat, lng);
            
            // Handle polar day/night
            let daylightHours;
            if (!sunrise || !sunset || isNaN(sunrise) || isNaN(sunset)) {
                // Check sun position at noon
                const noon = new Date(date);
                noon.setHours(12, 0, 0, 0);
                const sunPos = SunCalc.getPosition(noon, lat, lng);
                
                // If sun is above horizon at noon, it's polar day (24h daylight)
                // If below, it's polar night (0h daylight)
                daylightHours = sunPos.altitude > 0 ? 24 : 0;
                
                data.push({
                    date: date,
                    sunrise: null,
                    sunset: null,
                    daylight: daylightHours,
                    isPolarExtreme: true,
                    isToday: this.isSameDay(date, today),
                    solarNoon: solarNoon,
                    maxAltitude: maxAltitude,
                    altitude9am: morning9Pos.altitude * 180 / Math.PI,
                    altitude3pm: afternoon3Pos.altitude * 180 / Math.PI
                });
            } else {
                daylightHours = (sunset - sunrise) / (1000 * 60 * 60);
                data.push({
                    date: date,
                    sunrise: sunrise,
                    sunset: sunset,
                    daylight: Math.max(0, Math.min(24, daylightHours)), // Clamp between 0-24
                    isPolarExtreme: false,
                    isToday: this.isSameDay(date, today),
                    solarNoon: solarNoon,
                    maxAltitude: maxAltitude,
                    altitude9am: morning9Pos.altitude * 180 / Math.PI,
                    altitude3pm: afternoon3Pos.altitude * 180 / Math.PI
                });
            }
        }
        
        // Calculate daily changes
        for (let i = 1; i < data.length; i++) {
            data[i].change = (data[i].daylight - data[i - 1].daylight) * 60; // in minutes
        }
        // For the first point, calculate change by looking at the day before
        if (data.length > 0) {
            // Calculate daylight for the day before the first data point
            const dayBefore = new Date(data[0].date);
            dayBefore.setDate(dayBefore.getDate() - 1);
            const timesBefore = SunCalc.getTimes(dayBefore, lat, lng);
            
            if (timesBefore.sunrise && timesBefore.sunset && !isNaN(timesBefore.sunrise) && !isNaN(timesBefore.sunset)) {
                const daylightBefore = (timesBefore.sunset - timesBefore.sunrise) / (1000 * 60 * 60);
                data[0].change = (data[0].daylight - daylightBefore) * 60;
            } else {
                // If we can't calculate the day before, use the same change as the next day
                data[0].change = data[1] ? data[1].change : 0;
            }
        }
        
        // Store in cache
        this.dataCache.set(cacheKey, {
            data: data,
            timestamp: Date.now()
        });
        
        // Limit cache size
        if (this.dataCache.size > 20) {
            const firstKey = this.dataCache.keys().next().value;
            this.dataCache.delete(firstKey);
        }
        
        return data;
    },
    
    isSameDay(date1, date2) {
        return date1.getFullYear() === date2.getFullYear() &&
               date1.getMonth() === date2.getMonth() &&
               date1.getDate() === date2.getDate();
    },
    
    formatTime(date, timezoneOffset = 0) {
        // Handle invalid dates
        if (!date || isNaN(date)) return 'N/A';
        
        // Convert to local time using timezone offset
        // The offset is in hours, convert to milliseconds
        const localDate = new Date(date.getTime() + timezoneOffset * 60 * 60 * 1000);
        const hours = localDate.getUTCHours();
        const minutes = localDate.getUTCMinutes();
        const displayHours = hours.toString().padStart(2, '0');
        const displayMinutes = minutes.toString().padStart(2, '0');
        return `${displayHours}:${displayMinutes}`;
    },
    
    formatDuration(hours) {
        const h = Math.floor(hours);
        const m = Math.round((hours - h) * 60);
        return `${h}h ${m}m`;
    },
    
    formatDateShort(date) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    },
    
    formatDateCompact: d3.timeFormat('%b %d'),
    
    renderSunPath(today, timezoneOffset, location) {
        const svg = d3.select('#sun-path-mini');
        svg.selectAll('*').remove();
        
        const width = 200;
        const height = 80;  // Increased height for time labels
        const margin = { top: 10, right: 15, bottom: 15, left: 15 };
        const chartWidth = width - margin.left - margin.right;
        const chartHeight = height - margin.top - margin.bottom;
        
        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);
        
        if (today.isPolarExtreme) {
            // For polar day/night, show a simple message
            g.append('text')
                .attr('x', chartWidth / 2)
                .attr('y', chartHeight / 2)
                .attr('text-anchor', 'middle')
                .attr('font-size', '12px')
                .attr('fill', 'rgba(255, 255, 255, 0.7)')
                .text(today.daylight === 24 ? 'Polar Day - Sun never sets' : 'Polar Night - Sun never rises');
            return;
        }
        
        const centerX = chartWidth / 2;
        const centerY = chartHeight - 10;  // Leave room for time labels
        
        // Draw horizon line
        g.append('line')
            .attr('x1', 0)
            .attr('x2', chartWidth)
            .attr('y1', centerY)
            .attr('y2', centerY)
            .attr('stroke', 'rgba(255, 255, 255, 0.3)')
            .attr('stroke-width', 1);
        
        // Calculate key times
        const sunrise = new Date(today.sunrise);
        const sunset = new Date(today.sunset);
        const dayDuration = sunset - sunrise;
        const now = new Date();
        
        // Function to get position on arc (0 = sunrise, 1 = sunset)
        const getArcPosition = (time) => {
            const progress = (time - sunrise) / dayDuration;
            return Math.max(0, Math.min(1, progress));
        };
        
        // Function to calculate sun altitude at any time
        const getSunAltitude = (time) => {
            const pos = SunCalc.getPosition(time, location.lat, location.lng);
            return Math.max(0, pos.altitude * 180 / Math.PI);
        };
        
        // Draw the elapsed/remaining portions
        const currentProgress = getArcPosition(now);
        const isNighttime = now < sunrise || now > sunset;
        
        if (!isNighttime && currentProgress >= 0 && currentProgress <= 1) {
            // Draw elapsed portion (shaded)
            const elapsedPoints = [];
            elapsedPoints.push([0, centerY]);  // Start at horizon
            
            // Sample points along the elapsed arc
            for (let i = 0; i <= currentProgress; i += 0.02) {
                const time = new Date(sunrise.getTime() + i * dayDuration);
                const altitude = getSunAltitude(time);
                const x = i * chartWidth;
                const y = centerY - (altitude / 90) * (chartHeight - 20);
                elapsedPoints.push([x, y]);
            }
            
            elapsedPoints.push([currentProgress * chartWidth, centerY]);  // Back to horizon
            
            // Draw filled area for elapsed time
            const line = d3.line().curve(d3.curveNatural);
            g.append('path')
                .attr('d', line(elapsedPoints) + ' Z')
                .attr('fill', 'rgba(255, 200, 0, 0.15)')
                .attr('stroke', 'none');
        }
        
        // Draw the full sun path arc
        const pathPoints = [];
        for (let i = 0; i <= 1; i += 0.02) {
            const time = new Date(sunrise.getTime() + i * dayDuration);
            const altitude = getSunAltitude(time);
            const x = i * chartWidth;
            const y = centerY - (altitude / 90) * (chartHeight - 20);
            pathPoints.push([x, y]);
        }
        
        const line = d3.line().curve(d3.curveNatural);
        g.append('path')
            .attr('d', line(pathPoints))
            .attr('fill', 'none')
            .attr('stroke', 'rgba(255, 200, 0, 0.6)')
            .attr('stroke-width', 2);
        
        // Add hour markers
        const hourMarkers = [9, 12, 15];  // 9am, noon, 3pm
        hourMarkers.forEach(hour => {
            const markerTime = new Date(today.date);
            markerTime.setHours(hour, 0, 0, 0);
            
            if (markerTime >= sunrise && markerTime <= sunset) {
                const progress = getArcPosition(markerTime);
                const altitude = getSunAltitude(markerTime);
                const x = progress * chartWidth;
                const y = centerY - (altitude / 90) * (chartHeight - 20);
                
                // Hour tick mark
                g.append('line')
                    .attr('x1', x)
                    .attr('x2', x)
                    .attr('y1', y - 3)
                    .attr('y2', y + 3)
                    .attr('stroke', 'rgba(255, 255, 255, 0.4)')
                    .attr('stroke-width', 1);
                
                // Hour label
                g.append('text')
                    .attr('x', x)
                    .attr('y', y - 6)
                    .attr('text-anchor', 'middle')
                    .attr('font-size', '8px')
                    .attr('fill', 'rgba(255, 255, 255, 0.5)')
                    .text(hour === 12 ? 'noon' : `${hour > 12 ? hour - 12 : hour}${hour >= 12 ? 'pm' : 'am'}`);
            }
        });
        
        // Add sunrise/sunset markers and times
        g.append('circle')
            .attr('cx', 0)
            .attr('cy', centerY)
            .attr('r', 3)
            .attr('fill', '#FF9800');
        
        g.append('text')
            .attr('x', 0)
            .attr('y', centerY + 10)
            .attr('text-anchor', 'start')
            .attr('font-size', '8px')
            .attr('fill', 'rgba(255, 255, 255, 0.6)')
            .text(this.formatTime(sunrise, timezoneOffset));
        
        g.append('circle')
            .attr('cx', chartWidth)
            .attr('cy', centerY)
            .attr('r', 3)
            .attr('fill', '#FF5722');
        
        g.append('text')
            .attr('x', chartWidth)
            .attr('y', centerY + 10)
            .attr('text-anchor', 'end')
            .attr('font-size', '8px')
            .attr('fill', 'rgba(255, 255, 255, 0.6)')
            .text(this.formatTime(sunset, timezoneOffset));
        
        // Add current sun position if daytime
        if (!isNighttime && currentProgress >= 0 && currentProgress <= 1) {
            const currentAltitude = getSunAltitude(now);
            const currentX = currentProgress * chartWidth;
            const currentY = centerY - (currentAltitude / 90) * (chartHeight - 20);
            
            // Glowing current position
            g.append('circle')
                .attr('cx', currentX)
                .attr('cy', currentY)
                .attr('r', 5)
                .attr('fill', '#FFD700')
                .attr('opacity', 0.3);
            
            g.append('circle')
                .attr('cx', currentX)
                .attr('cy', currentY)
                .attr('r', 3)
                .attr('fill', '#FFD700');
        }
    },
    
    updateTodayStats(data, location) {
        const today = data.find(d => d.isToday);
        if (today) {
            const timezoneOffset = location?.timezoneOffset || 0;
            
            // Update location name in stats card
            const locationNameEl = document.getElementById('stats-location-name');
            if (locationNameEl) {
                locationNameEl.textContent = location?.name || 'Location';
                
                // Add color indicator if location has a color index
                if (location?.colorIndex !== undefined) {
                    const color = this.locationColors[location.colorIndex];
                    locationNameEl.style.color = color;
                }
            }
            
            // Update sunrise/sunset times
            if (today.isPolarExtreme) {
                document.getElementById('sunrise-time').textContent = today.daylight === 24 ? 'Polar Day' : 'No sunrise';
                document.getElementById('sunset-time').textContent = today.daylight === 24 ? 'No sunset' : 'Polar Night';
            } else {
                document.getElementById('sunrise-time').textContent = this.formatTime(today.sunrise, timezoneOffset);
                document.getElementById('sunset-time').textContent = this.formatTime(today.sunset, timezoneOffset);
            }
            
            // Update daylight hours
            document.getElementById('daylight-hours').textContent = this.formatDuration(today.daylight);
            
            // Update daily change
            const changeText = today.change > 0 ? `+${today.change.toFixed(1)}` : today.change.toFixed(1);
            const changeClass = today.change > 0 ? 'positive' : 'negative';
            const changeEl = document.getElementById('daylight-change');
            changeEl.textContent = `${changeText} min/day`;
            changeEl.className = `stat-change ${changeClass}`;
            
            // Update solar noon information
            const solarNoonEl = document.getElementById('solar-noon-time');
            const solarAltitudeEl = document.getElementById('solar-noon-altitude');
            if (solarNoonEl && solarAltitudeEl) {
                solarNoonEl.textContent = this.formatTime(today.solarNoon, timezoneOffset);
                solarAltitudeEl.textContent = `(${today.maxAltitude.toFixed(1)}°)`;
            }
            
            // Render sun path visualization
            this.renderSunPath(today, timezoneOffset, location);
            
            // Calculate and update 30-day forecast
            const todayIndex = data.findIndex(d => d.isToday);
            const futureIndex = Math.min(todayIndex + 30, data.length - 1);
            const futureData = data[futureIndex];
            
            if (futureData) {
                const totalChange = (futureData.daylight - today.daylight) * 60; // in minutes
                const daysAhead = futureIndex - todayIndex;
                
                const forecastEl = document.getElementById('monthly-forecast');
                const iconEl = forecastEl.querySelector('.forecast-icon');
                const textEl = forecastEl.querySelector('.forecast-text');
                
                // Set icon and styling based on trend
                if (totalChange > 0) {
                    iconEl.textContent = '📈';
                    forecastEl.className = 'forecast-value forecast-positive';
                    textEl.innerHTML = `Gaining <strong>${Math.abs(totalChange).toFixed(0)} minutes</strong> of daylight over the next ${daysAhead} days`;
                } else if (totalChange < 0) {
                    iconEl.textContent = '📉';
                    forecastEl.className = 'forecast-value forecast-negative';
                    textEl.innerHTML = `Losing <strong>${Math.abs(totalChange).toFixed(0)} minutes</strong> of daylight over the next ${daysAhead} days`;
                } else {
                    iconEl.textContent = '➡️';
                    forecastEl.className = 'forecast-value';
                    textEl.innerHTML = `Daylight remains stable over the next ${daysAhead} days`;
                }
            }
        }
    },
    
    renderChart(datasets) {
        const container = document.getElementById('chart-container');
        const svg = d3.select('#daylight-chart');
        
        if (!datasets || datasets.length === 0) return;
        
        // Always clear and redraw to avoid duplicate lines
        svg.selectAll('*').remove();
        
        const margin = { top: 25, right: 15, bottom: 40, left: 45 };
        const width = container.clientWidth - margin.left - margin.right;
        const chartHeight = 240; // Actual chart drawing area
        
        svg.attr('width', width + margin.left + margin.right)
           .attr('height', chartHeight + margin.top + margin.bottom);
        
        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);
        
        // Get all data points for scale calculation
        const allData = datasets.flatMap(d => d.data);
        
        // Scales
        const x = d3.scaleTime()
            .domain(d3.extent(allData, d => d.date))
            .range([0, width]);
        
        const y = d3.scaleLinear()
            .domain([
                Math.floor(d3.min(allData, d => d.daylight)),
                Math.ceil(d3.max(allData, d => d.daylight))
            ])
            .range([chartHeight, 0]);
        
        // Line generator
        const line = d3.line()
            .x(d => x(d.date))
            .y(d => y(d.daylight))
            .curve(d3.curveMonotoneX);
        
        // Add defs for gradients
        const defs = svg.append('defs');
        
        // Area under curve
        const area = d3.area()
            .x(d => x(d.date))
            .y0(chartHeight)
            .y1(d => y(d.daylight))
            .curve(d3.curveMonotoneX);
        
        // Draw curves for each location
        datasets.forEach((dataset, index) => {
            const isPrimary = dataset.location.isPrimary;
            const color = this.locationColors[index % this.locationColors.length];
            const opacity = isPrimary ? 1 : 0.7;
            
            // Only draw area for primary location
            if (isPrimary && datasets.length === 1) {
                // Create seasonal gradient for single location
                const seasonalGradient = defs.append('linearGradient')
                    .attr('id', `gradient-${index}`)
                    .attr('x1', '0%')
                    .attr('y1', '0%')
                    .attr('x2', '100%')
                    .attr('y2', '0%');
                
                const monthsInView = [];
                dataset.data.forEach((d, i) => {
                    if (i % 30 === 0) {
                        monthsInView.push({
                            offset: (i / dataset.data.length) * 100,
                            month: d.date.getMonth()
                        });
                    }
                });
                
                const getSeasonColor = (month) => {
                    const seasonColors = {
                        winter: '#6B83D6',
                        spring: '#81C784',
                        summer: '#FFB74D',
                        fall: '#FF8A65'
                    };
                    
                    if (month === 11 || month <= 1) return seasonColors.winter;
                    if (month >= 2 && month <= 4) return seasonColors.spring;
                    if (month >= 5 && month <= 7) return seasonColors.summer;
                    return seasonColors.fall;
                };
                
                monthsInView.forEach(m => {
                    seasonalGradient.append('stop')
                        .attr('offset', `${m.offset}%`)
                        .attr('stop-color', getSeasonColor(m.month))
                        .attr('stop-opacity', 0.3);
                });
                
                g.append('path')
                    .datum(dataset.data)
                    .attr('fill', `url(#gradient-${index})`)
                    .attr('d', area)
                    .attr('opacity', 0)
                    .transition()
                    .duration(1500)
                    .attr('opacity', 1);
            }
            
            // Draw line for each location
            const path = g.append('path')
                .datum(dataset.data)
                .attr('fill', 'none')
                .attr('stroke', color)
                .attr('stroke-width', isPrimary ? 2.5 : 2)
                .attr('stroke-opacity', opacity)
                .attr('d', line);
            
            // Animate line drawing
            const totalLength = path.node().getTotalLength();
            path.attr('stroke-dasharray', totalLength + ' ' + totalLength)
                .attr('stroke-dashoffset', totalLength)
                .transition()
                .duration(2000)
                .delay(index * 200)
                .ease(d3.easeLinear)
                .attr('stroke-dashoffset', 0);
            
            // Add location label for each curve
            if (datasets.length > 1) {
                const lastDataPoint = dataset.data[dataset.data.length - 1];
                g.append('text')
                    .attr('class', 'location-label')
                    .attr('x', x(lastDataPoint.date) + 5)
                    .attr('y', y(lastDataPoint.daylight))
                    .attr('fill', color)
                    .attr('font-size', '11px')
                    .attr('font-weight', isPrimary ? '600' : '400')
                    .attr('opacity', 0)
                    .text(dataset.location.name.split(',')[0])
                    .transition()
                    .delay(2000 + index * 200)
                    .duration(500)
                    .attr('opacity', opacity);
            }
        });
        
        // Add X axis
        const xAxis = d3.axisBottom(x)
            .tickFormat(d3.timeFormat('%b'))
            .ticks(d3.timeMonth.every(1));
        
        g.append('g')
            .attr('transform', `translate(0,${chartHeight})`)
            .attr('class', 'x-axis')
            .call(xAxis);
        
        // Add Y axis
        const yAxis = d3.axisLeft(y)
            .tickFormat(d => `${d}h`)
            .ticks(5);
        
        g.append('g')
            .attr('class', 'y-axis')
            .call(yAxis);
        
        // Add today marker for primary location
        const primaryDataset = datasets.find(d => d.location.isPrimary) || datasets[0];
        const todayData = primaryDataset.data.find(d => d.isToday);
        if (todayData) {
            // Gradient for today line
            const todayGradient = defs.append('linearGradient')
                .attr('id', 'today-gradient')
                .attr('x1', '0%')
                .attr('y1', '0%')
                .attr('x2', '0%')
                .attr('y2', '100%');
            
            todayGradient.append('stop')
                .attr('offset', '0%')
                .attr('stop-color', '#2196F3')
                .attr('stop-opacity', 0.8);
            
            todayGradient.append('stop')
                .attr('offset', '100%')
                .attr('stop-color', '#2196F3')
                .attr('stop-opacity', 0);
            
            // Today line with gradient
            g.append('line')
                .attr('class', 'today-line')
                .attr('x1', x(todayData.date))
                .attr('x2', x(todayData.date))
                .attr('y1', 0)
                .attr('y2', chartHeight)
                .attr('stroke', 'url(#today-gradient)')
                .attr('stroke-width', 2)
                .attr('opacity', 0)
                .transition()
                .delay(1000)
                .duration(1000)
                .attr('opacity', 1);
            
            // Glowing marker
            g.append('circle')
                .attr('class', 'today-marker-glow')
                .attr('cx', x(todayData.date))
                .attr('cy', y(todayData.daylight))
                .attr('r', 12)
                .attr('fill', 'none')
                .attr('stroke', '#2196F3')
                .attr('stroke-width', 2)
                .attr('opacity', 0.3);
            
            g.append('circle')
                .attr('class', 'today-marker')
                .attr('cx', x(todayData.date))
                .attr('cy', y(todayData.daylight))
                .attr('r', 0)
                .attr('fill', '#2196F3')
                .transition()
                .delay(1500)
                .duration(500)
                .attr('r', 6);
            
            // Add "TODAY" label
            g.append('text')
                .attr('class', 'today-label')
                .attr('x', x(todayData.date))
                .attr('y', -5)
                .attr('text-anchor', 'middle')
                .attr('fill', '#2196F3')
                .attr('font-size', '10px')
                .attr('font-weight', '600')
                .attr('letter-spacing', '1px')
                .text('TODAY')
                .attr('opacity', 0)
                .transition()
                .delay(2000)
                .duration(500)
                .attr('opacity', 1);
        }
        
        // Add interactive overlay for touch/mouse events
        this.addInteractiveOverlay(g, datasets, x, y, width, chartHeight);
        
        // Hide loading indicator
        document.querySelector('.chart-loading').style.display = 'none';
        
        // Render altitude chart
        this.renderAltitudeChart(datasets, x, margin, width);
    },
    
    addInteractiveOverlay(g, datasets, xScale, yScale, width, height) {
        const self = this;
        
        // Create a single overlay rectangle
        const overlay = g.append('rect')
            .attr('class', 'chart-overlay')
            .attr('width', width)
            .attr('height', height)
            .attr('fill', 'transparent')
            .style('cursor', 'crosshair');
        
        // Find the nearest data point to the mouse/touch position
        const findNearestPoint = (mouseX) => {
            const primaryDataset = datasets.find(d => d.location.isPrimary) || datasets[0];
            const data = primaryDataset.data;
            
            // Convert pixel position to date
            const x0 = xScale.invert(mouseX);
            
            // Use bisector to find the nearest points
            const bisect = d3.bisector(d => d.date).left;
            const i = bisect(data, x0, 1);
            const d0 = data[i - 1];
            const d1 = data[i];
            
            // Return the closer point
            if (!d1) return d0;
            if (!d0) return d1;
            return x0 - d0.date > d1.date - x0 ? d1 : d0;
        };
        
        // Handle showing the tooltip
        const handleInteraction = function(event) {
            // Skip mouse events on mobile
            if (self.isMobile && event.type.startsWith('mouse')) return;
            
            const [mouseX, mouseY] = d3.pointer(event, this);
            
            // Find nearest data point
            const nearestPoint = findNearestPoint(mouseX);
            if (!nearestPoint) return;
            
            // Only update if we've moved to a different point
            if (self.currentHoverPoint === nearestPoint) return;
            self.currentHoverPoint = nearestPoint;
            
            // Clear any pending hide timer
            if (self.hideTooltipTimer) {
                clearTimeout(self.hideTooltipTimer);
                self.hideTooltipTimer = null;
            }
            
            // Update tooltip (desktop only)
            if (!self.isMobile) {
                self.updateTooltip(nearestPoint, datasets, xScale, yScale, g, event);
            }
        };
        
        // Handle hiding the tooltip
        const handleLeave = function() {
            // Delay hiding to prevent flicker when moving between elements
            self.hideTooltipTimer = setTimeout(() => {
                self.hideTooltip(g);
            }, 100);
        };
        
        // Mouse events
        overlay
            .on('mousemove', handleInteraction)
            .on('mouseenter', handleInteraction)
            .on('mouseleave', handleLeave);
        
        // Touch events (mobile)
        overlay
            .on('touchstart', function(event) {
                event.preventDefault();
                const touch = event.touches[0];
                const [touchX] = d3.pointer(touch, this);
                
                const nearestPoint = findNearestPoint(touchX);
                if (nearestPoint) {
                    self.currentHoverPoint = nearestPoint;
                    
                    if (self.isMobile) {
                        // Show selected day line
                        self.showSelectedDayLine(nearestPoint, datasets, xScale, g);
                        
                        // Get data for all locations
                        const allLocationData = datasets.map((dataset, idx) => {
                            const point = dataset.data.find(p => 
                                self.isSameDay(p.date, nearestPoint.date)
                            );
                            return {
                                location: dataset.location,
                                data: point,
                                color: self.locationColors[idx % self.locationColors.length]
                            };
                        }).filter(item => item.data);
                        
                        // Show bottom sheet
                        self.showBottomSheet(nearestPoint, allLocationData);
                    } else {
                        self.updateTooltip(nearestPoint, datasets, xScale, yScale, g, touch);
                    }
                }
            })
            .on('touchmove', function(event) {
                event.preventDefault();
                // On mobile, don't update on move - require tap
                if (self.isMobile) return;
                
                const touch = event.touches[0];
                const [touchX] = d3.pointer(touch, this);
                
                const nearestPoint = findNearestPoint(touchX);
                if (nearestPoint && nearestPoint !== self.currentHoverPoint) {
                    self.currentHoverPoint = nearestPoint;
                    self.updateTooltip(nearestPoint, datasets, xScale, yScale, g, touch);
                }
            })
            .on('touchend', function(event) {
                event.preventDefault();
                // On desktop tablets with touch, hide tooltip after delay
                if (!self.isMobile) {
                    self.hideTooltipTimer = setTimeout(() => {
                        self.hideTooltip(g);
                    }, 2000);
                }
            });
    },
    
    updateTooltip(dataPoint, datasets, xScale, yScale, g, event) {
        // Clear existing hover dots
        g.selectAll('.hover-dot').remove();
        
        // Get data for this date from all datasets
        const allLocationData = datasets.map((dataset, idx) => {
            const point = dataset.data.find(p => 
                this.isSameDay(p.date, dataPoint.date)
            );
            return {
                location: dataset.location,
                data: point,
                color: this.locationColors[idx % this.locationColors.length]
            };
        }).filter(item => item.data);
        
        // Calculate monthly change
        const getMonthlyChange = (data, currentIndex) => {
            const futureIndex = Math.min(currentIndex + 30, data.length - 1);
            const futureData = data[futureIndex];
            const currentData = data[currentIndex];
            if (futureData && currentData) {
                const totalChange = (futureData.daylight - currentData.daylight) * 60;
                const daysAhead = futureIndex - currentIndex;
                return { totalChange, daysAhead };
            }
            return null;
        };
        
        // Add visual feedback dots for all locations at exact points
        allLocationData.forEach(item => {
            // Add hover indicator dots
            g.append('circle')
                .attr('class', 'hover-dot')
                .attr('cx', xScale(item.data.date))
                .attr('cy', yScale(item.data.daylight))
                .attr('r', 10)
                .attr('fill', 'none')
                .attr('stroke', item.color)
                .attr('stroke-width', 2)
                .attr('opacity', 0.5);
            
            g.append('circle')
                .attr('class', 'hover-dot')
                .attr('cx', xScale(item.data.date))
                .attr('cy', yScale(item.data.daylight))
                .attr('r', 4)
                .attr('fill', item.color);
        });
        
        // Build tooltip content for all locations
        let tooltipContent = `<div class="tooltip-date">${this.formatDateCompact(dataPoint.date)}</div>`;
                
                allLocationData.forEach(item => {
                    const changeClass = item.data.change > 0 ? 'positive' : 'negative';
                    const changeSymbol = item.data.change > 0 ? '▲' : '▼';
                    const isPrimary = item.location.isPrimary;
                    
                    // Find current index and calculate monthly change
                    const currentIndex = datasets.find(ds => ds.location === item.location)
                        .data.findIndex(point => this.isSameDay(point.date, dataPoint.date));
                    const monthlyData = getMonthlyChange(
                        datasets.find(ds => ds.location === item.location).data,
                        currentIndex
                    );
                    
                    tooltipContent += `
                        <div class="tooltip-location ${isPrimary ? 'primary' : ''}" style="border-left: 3px solid ${item.color}">
                            <div class="location-name">${item.location.name.split(',')[0]}</div>`;
                    
                    if (item.data.isPolarExtreme) {
                        tooltipContent += `
                            <div class="tooltip-info">
                                ${item.data.daylight === 24 ? '☀️ Polar Day' : '🌙 Polar Night'}
                            </div>`;
                    } else {
                        const offset = item.location.timezoneOffset || 0;
                        tooltipContent += `
                            <div class="tooltip-info">
                                🌅 ${this.formatTime(item.data.sunrise, offset)} · 🌇 ${this.formatTime(item.data.sunset, offset)}
                            </div>`;
                    }
                    
                    // Add solar noon and altitude information
                    const offset = item.location.timezoneOffset || 0;
                    tooltipContent += `
                            <div class="tooltip-info">
                                ☀️ Solar noon: ${this.formatTime(item.data.solarNoon, offset)} at ${item.data.maxAltitude.toFixed(1)}°
                            </div>
                            <div class="tooltip-info">
                                🌤️ 9am: ${item.data.altitude9am.toFixed(1)}° · 3pm: ${item.data.altitude3pm.toFixed(1)}°
                            </div>`;
                    
                    tooltipContent += `
                            <div class="tooltip-stats">
                                <span>${this.formatDuration(item.data.daylight)}</span>
                                <span class="tooltip-change ${changeClass}">
                                    ${changeSymbol} ${Math.abs(item.data.change).toFixed(1)}min/day
                                </span>
                            </div>`;
                    
                    if (monthlyData) {
                        const monthlyClass = monthlyData.totalChange > 0 ? 'positive' : 'negative';
                        const monthlySymbol = monthlyData.totalChange > 0 ? '📈' : '📉';
                        const changeWord = monthlyData.totalChange > 0 ? 'Gaining' : 'Losing';
                        tooltipContent += `
                            <div class="tooltip-monthly ${monthlyClass}">
                                ${monthlySymbol} ${changeWord} ${Math.abs(monthlyData.totalChange).toFixed(0)} min over ${monthlyData.daysAhead} days
                            </div>`;
                    }
                    
                    tooltipContent += `</div>`;
                });
        
        // Show tooltip
        this.tooltip
            .html(tooltipContent)
            .style('opacity', 0.95);
        
        // Position tooltip
        this.positionTooltip(event);
    },
    
    hideTooltip(g) {
        this.currentHoverPoint = null;
        
        // Clear hover dots
        if (g) {
            g.selectAll('.hover-dot').remove();
        }
        
        // Hide tooltip
        if (this.tooltip) {
            this.tooltip.style('opacity', 0);
        }
    },
    
    positionTooltip(event) {
        const tooltip = this.tooltip;
        const tooltipNode = tooltip.node();
        const tooltipWidth = tooltipNode.offsetWidth || 300;
        const tooltipHeight = tooltipNode.offsetHeight || 200;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        // Check if mobile
        const isMobile = window.matchMedia('(max-width: 768px)').matches || 
                        'ontouchstart' in window;
        
        // Get correct coordinates for both mouse and touch events
        const pageX = event.pageX || event.clientX || (event.touches && event.touches[0].clientX);
        const pageY = event.pageY || event.clientY || (event.touches && event.touches[0].clientY);
        
        if (isMobile) {
            // Mobile: center horizontally, position above/below touch point
            const left = Math.max(10, Math.min(windowWidth - tooltipWidth - 10, 
                                               (windowWidth - tooltipWidth) / 2));
            let top = pageY - tooltipHeight - 30;
            
            // If tooltip would go off top, position below
            if (top < 10) {
                top = pageY + 30;
            }
            
            // If still off screen, center vertically
            if (top + tooltipHeight > windowHeight - 10) {
                top = (windowHeight - tooltipHeight) / 2;
            }
            
            tooltip
                .style('left', left + 'px')
                .style('top', top + 'px');
        } else {
            // Desktop: prefer left side of cursor
            let left = pageX - tooltipWidth - 15;
            let top = pageY - tooltipHeight / 2;
            
            // If tooltip would go off left edge, position to right of cursor
            if (left < 10) {
                left = pageX + 15;
            }
            
            // Top edge check
            if (top < 10) {
                top = 10;
            }
            
            // Bottom edge check
            if (top + tooltipHeight > windowHeight - 10) {
                top = windowHeight - tooltipHeight - 10;
            }
            
            tooltip
                .style('left', left + 'px')
                .style('top', top + 'px');
        }
    },
    
    renderAltitudeChart(datasets, xScale, parentMargin, parentWidth) {
        const container = document.getElementById('altitude-container');
        if (!container) {
            console.error('Altitude container not found');
            return;
        }
        
        const svg = d3.select('#altitude-chart');
        
        if (!datasets || datasets.length === 0) return;
        
        // Check if container has width
        if (container.clientWidth === 0) {
            console.warn('Altitude container has no width');
            return;
        }
        
        // Clear previous content
        svg.selectAll('*').remove();
        
        // Use same margins as parent chart for alignment
        const margin = { top: 25, right: parentMargin.right, bottom: 30, left: parentMargin.left };
        const width = parentWidth;
        const chartHeight = 160; // Good height for altitude visualization
        
        svg.attr('width', width + margin.left + margin.right)
           .attr('height', chartHeight + margin.top + margin.bottom);
        
        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);
        
        // Get all data points for scale calculation
        const allData = datasets.flatMap(d => d.data);
        
        // Y scale for altitude (0 to max altitude + padding)
        const maxAltitude = Math.max(...allData.map(d => d.maxAltitude));
        const y = d3.scaleLinear()
            .domain([0, Math.min(90, maxAltitude + 5)]) // Cap at 90 degrees
            .range([chartHeight, 0]);
        
        // Line generator for altitude
        const line = d3.line()
            .x(d => xScale(d.date))
            .y(d => y(d.maxAltitude))
            .curve(d3.curveMonotoneX);
        
        // Add background zones for altitude ranges
        const zones = [
            { min: 0, max: 20, color: 'rgba(100, 100, 255, 0.1)', label: 'Low sun' },
            { min: 20, max: 45, color: 'rgba(150, 150, 255, 0.1)', label: 'Moderate' },
            { min: 45, max: 70, color: 'rgba(200, 200, 255, 0.1)', label: 'High sun' },
            { min: 70, max: 90, color: 'rgba(255, 255, 255, 0.1)', label: 'Overhead' }
        ];
        
        zones.forEach(zone => {
            if (zone.min < y.domain()[1]) {
                g.append('rect')
                    .attr('x', 0)
                    .attr('y', y(Math.min(zone.max, y.domain()[1])))
                    .attr('width', width)
                    .attr('height', y(zone.min) - y(Math.min(zone.max, y.domain()[1])))
                    .attr('fill', zone.color);
            }
        });
        
        // Draw altitude lines for each location
        datasets.forEach((dataset, index) => {
            const color = this.locationColors[dataset.location.colorIndex || 0];
            
            g.append('path')
                .datum(dataset.data)
                .attr('class', 'altitude-line')
                .attr('fill', 'none')
                .attr('stroke', color)
                .attr('stroke-width', dataset.location.isPrimary ? 2.5 : 2)
                .attr('opacity', dataset.location.isPrimary ? 1 : 0.7)
                .attr('d', line);
        });
        
        // Find today's data for the today line
        const todayData = allData.find(d => d.isToday);
        if (todayData) {
            g.append('line')
                .attr('class', 'today-line-altitude')
                .attr('x1', xScale(todayData.date))
                .attr('x2', xScale(todayData.date))
                .attr('y1', 0)
                .attr('y2', chartHeight)
                .attr('stroke', '#00BCD4')
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', '5,5')
                .attr('opacity', 0.8);
        }
        
        // Add Y axis
        const yAxis = d3.axisLeft(y)
            .tickFormat(d => `${d}°`)
            .ticks(6)
            .tickSize(-width);
        
        g.append('g')
            .attr('class', 'y-axis altitude-axis')
            .call(yAxis);
        
        // Add label
        g.append('text')
            .attr('class', 'altitude-label')
            .attr('x', 0)
            .attr('y', -10)
            .attr('font-size', '12px')
            .attr('fill', 'rgba(255, 255, 255, 0.7)')
            .text('Solar noon altitude');
    },
    
    calculateAndRenderData() {
        if (this.locations.length === 0) {
            // Clear the chart and stats when no locations
            this.clearChart();
            this.clearStats();
            return;
        }
        
        const datasets = this.locations.map(location => ({
            location: location,
            data: this.calculateYearData(location.lat, location.lng)
        }));
        
        const primaryDataset = datasets.find(d => d.location.isPrimary) || datasets[0];
        this.updateTodayStats(primaryDataset.data, primaryDataset.location);
        this.renderChart(datasets);
        
        // If bottom sheet is open on mobile, update it with new primary location
        if (this.isMobile && this.selectedDayData && this.bottomSheet && 
            this.bottomSheet.classList.contains('active')) {
            // Re-show bottom sheet with updated data
            const allLocationData = datasets.map((dataset, idx) => {
                const point = dataset.data.find(p => 
                    this.isSameDay(p.date, this.selectedDayData.date)
                );
                return {
                    location: dataset.location,
                    data: point,
                    color: this.locationColors[idx % this.locationColors.length]
                };
            }).filter(item => item.data);
            
            this.showBottomSheet(this.selectedDayData, allLocationData);
        }
    },
    
    clearChart() {
        const svg = d3.select('#daylight-chart');
        svg.selectAll('*').remove();
        
        // Clear altitude chart too
        const altitudeSvg = d3.select('#altitude-chart');
        altitudeSvg.selectAll('*').remove();
        
        // Show a message when no locations
        const container = document.getElementById('chart-container');
        const width = container.clientWidth;
        const height = 300;
        
        svg.attr('width', width)
           .attr('height', height);
        
        svg.append('text')
            .attr('x', width / 2)
            .attr('y', height / 2)
            .attr('text-anchor', 'middle')
            .attr('fill', 'rgba(255, 255, 255, 0.3)')
            .attr('font-size', '16px')
            .text('Search for a location to see daylight hours');
    },
    
    clearStats() {
        const locationNameEl = document.getElementById('stats-location-name');
        if (locationNameEl) {
            locationNameEl.textContent = '-';
            locationNameEl.style.color = '';
        }
        
        document.getElementById('sunrise-time').textContent = '-';
        document.getElementById('sunset-time').textContent = '-';
        document.getElementById('daylight-hours').textContent = '-';
        document.getElementById('daylight-change').textContent = '';
        
        const forecastEl = document.getElementById('monthly-forecast');
        if (forecastEl) {
            forecastEl.querySelector('.forecast-icon').textContent = '-';
            forecastEl.querySelector('.forecast-text').textContent = '-';
            forecastEl.className = 'forecast-value';
        }
    },
    
    setupEventListeners() {
        // Simple resize handler with built-in delay
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                this.calculateAndRenderData();
            }, 250);
        });
        
        // Handle orientation change
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                this.calculateAndRenderData();
            }, 100);
        });
    }
};

// Export App to window
window.App = App;

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});