const App = {
    locations: [],
    locationColors: ['#2196F3', '#4CAF50', '#FF9800'],
    dataCache: new Map(),
    
    init() {
        this.updateDateDisplay();
        this.setupEventListeners();
        this.loadFromURL();
        window.LocationManager.init();
        window.KeyboardManager.init();
        window.ErrorHandler.init();
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
                    isToday: this.isSameDay(date, today)
                });
            } else {
                daylightHours = (sunset - sunrise) / (1000 * 60 * 60);
                data.push({
                    date: date,
                    sunrise: sunrise,
                    sunset: sunset,
                    daylight: Math.max(0, Math.min(24, daylightHours)), // Clamp between 0-24
                    isPolarExtreme: false,
                    isToday: this.isSameDay(date, today)
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
        // Convert to local time using timezone offset
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
        // Remove any existing tooltip first
        d3.select('.chart-tooltip').remove();
        
        const tooltip = d3.select('body').append('div')
            .attr('class', 'chart-tooltip')
            .style('opacity', 0);
        
        // Create invisible vertical strips for better hover detection
        const interactionData = primaryDataset.data;
        
        // Calculate width of each strip (distance between data points)
        const stripWidth = interactionData.length > 1 ? 
            x(interactionData[1].date) - x(interactionData[0].date) : 10;
        
        g.selectAll('.hover-strip')
            .data(interactionData)
            .enter().append('rect')
            .attr('class', 'hover-strip')
            .attr('x', d => x(d.date) - stripWidth / 2)
            .attr('y', 0)
            .attr('width', stripWidth)
            .attr('height', chartHeight)
            .attr('fill', 'transparent')
            .style('cursor', 'crosshair')
            .on('touchstart mouseover', (event, d) => {
                const formatDateShort = d3.timeFormat('%b %d');
                
                // Get data for this date from all datasets
                const allLocationData = datasets.map((dataset, idx) => {
                    const dataPoint = dataset.data.find(point => 
                        this.isSameDay(point.date, d.date)
                    );
                    return {
                        location: dataset.location,
                        data: dataPoint,
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
                    // Outer ring
                    g.append('circle')
                        .attr('class', 'hover-dot')
                        .attr('cx', x(item.data.date))
                        .attr('cy', y(item.data.daylight))
                        .attr('r', 0)
                        .attr('fill', 'none')
                        .attr('stroke', item.color)
                        .attr('stroke-width', 2)
                        .transition()
                        .duration(200)
                        .attr('r', 10);
                    
                    // Inner dot
                    g.append('circle')
                        .attr('class', 'hover-dot')
                        .attr('cx', x(item.data.date))
                        .attr('cy', y(item.data.daylight))
                        .attr('r', 3)
                        .attr('fill', item.color);
                });
                
                // Build tooltip content for all locations
                let tooltipContent = `<div class="tooltip-date">${formatDateShort(d.date)}</div>`;
                
                allLocationData.forEach(item => {
                    const changeClass = item.data.change > 0 ? 'positive' : 'negative';
                    const changeSymbol = item.data.change > 0 ? '▲' : '▼';
                    const isPrimary = item.location.isPrimary;
                    
                    // Find current index and calculate monthly change
                    const currentIndex = datasets.find(ds => ds.location === item.location)
                        .data.findIndex(point => this.isSameDay(point.date, d.date));
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
                
                tooltip.transition()
                    .duration(200)
                    .style('opacity', .95);
                
                // Smart positioning: prefer right side, but switch to left if near edge
                const tooltipNode = tooltip.node();
                tooltip.html(tooltipContent);
                
                const tooltipWidth = tooltipNode.offsetWidth || 300;
                const tooltipHeight = tooltipNode.offsetHeight || (allLocationData.length * 100);
                const windowWidth = window.innerWidth;
                const windowHeight = window.innerHeight;
                
                let left = event.pageX + 40; // More offset to right of cursor
                let top = event.pageY - tooltipHeight / 2; // Center vertically on cursor
                
                // If tooltip would go off right edge, position to left of cursor
                if (left + tooltipWidth > windowWidth - 20) {
                    left = event.pageX - tooltipWidth - 40;
                }
                
                // If tooltip would go off top, adjust down
                if (top < 20) {
                    top = 20;
                }
                
                // If tooltip would go off bottom, adjust up
                if (top + tooltipHeight > windowHeight - 20) {
                    top = windowHeight - tooltipHeight - 20;
                }
                
                tooltip
                    .style('left', left + 'px')
                    .style('top', top + 'px');
            })
            .on('touchend mouseout', () => {
                g.selectAll('.hover-dot').remove();
                tooltip.transition()
                    .duration(500)
                    .style('opacity', 0);
            });
        
        // Hide loading indicator
        document.querySelector('.chart-loading').style.display = 'none';
        
        // Render gradient chart
        this.renderGradientChart(datasets, x, margin, width);
    },
    
    renderGradientChart(datasets, xScale, parentMargin, parentWidth) {
        const container = document.getElementById('gradient-container');
        if (!container) {
            console.error('Gradient container not found');
            return;
        }
        
        const svg = d3.select('#gradient-chart');
        
        if (!datasets || datasets.length === 0) return;
        
        // Check if container has width
        if (container.clientWidth === 0) {
            console.warn('Gradient container has no width');
            return;
        }
        
        // Clear previous content
        svg.selectAll('*').remove();
        
        // Use same margins as parent chart for alignment
        const margin = { top: 25, right: parentMargin.right, bottom: 30, left: parentMargin.left };
        const width = parentWidth;
        const chartHeight = 120; // Increased height for better visibility
        
        svg.attr('width', width + margin.left + margin.right)
           .attr('height', chartHeight + margin.top + margin.bottom);
        
        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);
        
        // Get all data points for scale calculation
        const allData = datasets.flatMap(d => d.data);
        
        // Find min and max change rates
        const changeExtent = d3.extent(allData, d => d.change || 0);
        const maxAbsChange = Math.max(Math.abs(changeExtent[0]), Math.abs(changeExtent[1]));
        
        // Y scale for change rate (centered at 0)
        const y = d3.scaleLinear()
            .domain([-maxAbsChange, maxAbsChange])
            .range([chartHeight, 0]);
        
        // Line generator for gradient
        const line = d3.line()
            .x(d => xScale(d.date))
            .y(d => y(d.change || 0))
            .curve(d3.curveMonotoneX);
        
        // Add zero line
        g.append('line')
            .attr('class', 'zero-line')
            .attr('x1', 0)
            .attr('x2', width)
            .attr('y1', y(0))
            .attr('y2', y(0))
            .attr('stroke', 'rgba(255, 255, 255, 0.2)')
            .attr('stroke-dasharray', '3,3');
        
        // Draw gradient lines for each location
        datasets.forEach((dataset, index) => {
            const color = this.locationColors[dataset.location.colorIndex || 0];
            
            g.append('path')
                .datum(dataset.data)
                .attr('class', 'gradient-line')
                .attr('fill', 'none')
                .attr('stroke', color)
                .attr('stroke-width', dataset.location.isPrimary ? 2 : 1.5)
                .attr('opacity', dataset.location.isPrimary ? 1 : 0.6)
                .attr('d', line);
        });
        
        // Add Y axis
        const yAxis = d3.axisLeft(y)
            .tickFormat(d => `${d > 0 ? '+' : ''}${d}`)
            .ticks(5)
            .tickSize(-width);
        
        g.append('g')
            .attr('class', 'y-axis gradient-axis')
            .call(yAxis);
        
        // Add label
        g.append('text')
            .attr('class', 'gradient-label')
            .attr('x', 0)
            .attr('y', -10)
            .attr('font-size', '12px')
            .attr('fill', 'rgba(255, 255, 255, 0.7)')
            .text('Daily change (min/day)');
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
    },
    
    clearChart() {
        const svg = d3.select('#daylight-chart');
        svg.selectAll('*').remove();
        
        // Clear gradient chart too
        const gradientSvg = d3.select('#gradient-chart');
        gradientSvg.selectAll('*').remove();
        
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
        window.addEventListener('resize', () => {
            this.calculateAndRenderData();
        });
    }
};

// Export App to window
window.App = App;

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});