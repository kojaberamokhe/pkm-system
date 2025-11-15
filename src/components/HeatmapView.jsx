import React, { useState, useEffect } from 'react';

function HeatmapView() {
  const [heatmapData, setHeatmapData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [maxValue, setMaxValue] = useState(1);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());

  useEffect(() => {
    loadHeatmapData();
  }, [currentYear, currentMonth]);

  const loadHeatmapData = async () => {
    setIsLoading(true);
    try {
      const yearStart = new Date(currentYear, 0, 1);
      const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59);
      const now = new Date();
      
      // Calculate days from now to year boundaries
      const daysToYearStart = Math.floor((now - yearStart) / (1000 * 60 * 60 * 24));
      const daysToYearEnd = Math.floor((yearEnd - now) / (1000 * 60 * 60 * 24));
      
      // Request data: enough days back to cover year start, enough forward to cover year end
      const daysBack = Math.max(0, daysToYearStart) + 10; // Add buffer
      const daysForward = Math.max(0, daysToYearEnd) + 10; // Add buffer
      
      const data = await window.api.stats.getHeatmapData(daysBack, daysForward);
      
      // Filter to only show the selected year
      const yearDataMap = new Map();
      data.forEach(d => {
        const date = new Date(d.date);
        if (date.getFullYear() === currentYear) {
          yearDataMap.set(d.date, d);
        }
      });
      
      // Create entries for all days of the year, filling in missing days with zeros
      const allYearDays = [];
      const current = new Date(yearStart);
      while (current <= yearEnd) {
        const dateStr = current.toISOString().split('T')[0];
        const existingData = yearDataMap.get(dateStr);
        allYearDays.push(existingData || {
          date: dateStr,
          reviews: 0,
          scheduled: 0
        });
        current.setDate(current.getDate() + 1);
      }
      
      setHeatmapData(allYearDays);
      
      // Find max value for color scaling
      const max = Math.max(
        ...allYearDays.map(d => Math.max(d.reviews, d.scheduled)),
        1
      );
      setMaxValue(max);
    } catch (error) {
      console.error('Failed to load heatmap data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePreviousYear = () => {
    setCurrentYear(prev => prev - 1);
  };

  const handleNextYear = () => {
    setCurrentYear(prev => prev + 1);
  };

  const handleCurrentYear = () => {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
  };

  const getIntensity = (value) => {
    if (value === 0) return 0;
    // Scale from 1 to 4 intensity levels
    const ratio = value / maxValue;
    if (ratio <= 0.25) return 1;
    if (ratio <= 0.5) return 2;
    if (ratio <= 0.75) return 3;
    return 4;
  };

  const getColor = (reviews, scheduled, date) => {
    const now = new Date();
    const cellDate = new Date(date);
    const isPast = cellDate < now && cellDate.toDateString() !== now.toDateString();
    const isToday = cellDate.toDateString() === now.toDateString();
    
    const total = reviews + scheduled;
    const intensity = getIntensity(total);
    
    if (total === 0) {
      return 'var(--bg-tertiary)';
    }
    
    if (isToday) {
      // Today gets accent color
      return 'var(--accent)';
    }
    
    if (isPast) {
      // Past reviews - green shades
      const colors = [
        'rgba(14, 159, 110, 0.2)',  // level 1
        'rgba(14, 159, 110, 0.4)',  // level 2
        'rgba(14, 159, 110, 0.6)',  // level 3
        'rgba(14, 159, 110, 0.8)'   // level 4
      ];
      return colors[intensity - 1] || colors[0];
    } else {
      // Future scheduled - blue shades
      const colors = [
        'rgba(59, 130, 246, 0.2)',  // level 1
        'rgba(59, 130, 246, 0.4)',  // level 2
        'rgba(59, 130, 246, 0.6)',  // level 3
        'rgba(59, 130, 246, 0.8)'   // level 4
      ];
      return colors[intensity - 1] || colors[0];
    }
  };

  // Group data by months and weeks (calendar-style)
  const groupByMonths = (data) => {
    if (data.length === 0) return [];
    
    // Create a map for quick lookup
    const dataMap = new Map();
    data.forEach(item => {
      dataMap.set(item.date, item);
    });
    
    const months = [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Process each month of the year
    for (let month = 0; month < 12; month++) {
      const monthStart = new Date(currentYear, month, 1);
      const monthEnd = new Date(currentYear, month + 1, 0); // Last day of month
      
      // Find the Sunday of the week containing the first day of month
      const firstSunday = new Date(monthStart);
      firstSunday.setDate(monthStart.getDate() - monthStart.getDay());
      
      // Find the Saturday of the week containing the last day of month
      const lastSaturday = new Date(monthEnd);
      lastSaturday.setDate(monthEnd.getDate() + (6 - monthEnd.getDay()));
      
      // Generate all dates for this month's calendar view
      const monthWeeks = [];
      let currentWeek = [];
      const current = new Date(firstSunday);
      
      while (current <= lastSaturday) {
        const dateStr = current.toISOString().split('T')[0];
        const dayData = dataMap.get(dateStr) || { date: dateStr, reviews: 0, scheduled: 0 };
        const isCurrentMonth = current.getMonth() === month;
        
        currentWeek.push({
          ...dayData,
          isCurrentMonth,
          dayOfMonth: current.getDate()
        });
        
        if (currentWeek.length === 7) {
          monthWeeks.push(currentWeek);
          currentWeek = [];
        }
        
        current.setDate(current.getDate() + 1);
      }
      
      if (currentWeek.length > 0) {
        monthWeeks.push(currentWeek);
      }
      
      months.push({
        name: monthNames[month],
        month: month,
        weeks: monthWeeks
      });
    }
    
    return months;
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const months = groupByMonths(heatmapData);
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const isCurrentYear = currentYear === new Date().getFullYear();

  if (isLoading) {
    return (
      <div className="heatmap-view">
        <div className="heatmap-loading">Loading heatmap data...</div>
      </div>
    );
  }

  return (
    <div className="heatmap-view">
      <div className="heatmap-header">
        <div className="heatmap-title-section">
          <button 
            className="heatmap-nav-btn"
            onClick={handlePreviousYear}
            title="Previous year"
          >
            ←
          </button>
          <h2>{currentYear}</h2>
          <button 
            className="heatmap-nav-btn"
            onClick={handleNextYear}
            title="Next year"
          >
            →
          </button>
          {!isCurrentYear && (
            <button 
              className="heatmap-nav-btn current-year-btn"
              onClick={handleCurrentYear}
              title="Go to current year"
            >
              Today
            </button>
          )}
        </div>
        <div className="heatmap-legend">
          <div className="legend-item">
            <div className="legend-color" style={{ background: 'rgba(14, 159, 110, 0.6)' }}></div>
            <span>Past Reviews</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ background: 'rgba(59, 130, 246, 0.6)' }}></div>
            <span>Scheduled</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ background: 'var(--accent)' }}></div>
            <span>Today</span>
          </div>
        </div>
      </div>

      <div className="heatmap-calendar">
        {months.map((month, monthIdx) => (
          <div key={monthIdx} className="heatmap-month">
            <div className="month-header">
              <h3>{month.name}</h3>
            </div>
            <div className="month-calendar">
              <div className="calendar-day-labels">
                {dayLabels.map((day, idx) => (
                  <div key={idx} className="day-label-small">{day}</div>
                ))}
              </div>
              <div className="month-weeks">
                {month.weeks.map((week, weekIdx) => (
                  <div key={weekIdx} className="calendar-week">
                    {week.map((day, dayIdx) => {
                      if (!day.isCurrentMonth) {
                        return (
                          <div
                            key={`${monthIdx}-${weekIdx}-${dayIdx}`}
                            className="heatmap-cell empty other-month"
                          />
                        );
                      }
                      
                      const date = new Date(day.date);
                      const isToday = date.toDateString() === new Date().toDateString();
                      const hasActivity = day.reviews > 0 || day.scheduled > 0;
                      
                      return (
                        <div
                          key={`${monthIdx}-${weekIdx}-${dayIdx}`}
                          className={`heatmap-cell calendar-cell ${isToday ? 'today' : ''} ${hasActivity ? 'has-activity' : ''}`}
                          style={{
                            backgroundColor: getColor(day.reviews, day.scheduled, day.date)
                          }}
                          title={`${formatDate(day.date)}\nReviews: ${day.reviews}\nScheduled: ${day.scheduled}`}
                        >
                          <span className="day-number">{day.dayOfMonth}</span>
                          {isToday && <div className="today-indicator"></div>}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="heatmap-summary">
        <div className="summary-item">
          <strong>{heatmapData.reduce((sum, d) => sum + d.reviews, 0)}</strong>
          <span>Total Reviews</span>
        </div>
        <div className="summary-item">
          <strong>{heatmapData.reduce((sum, d) => sum + d.scheduled, 0)}</strong>
          <span>Total Scheduled</span>
        </div>
        <div className="summary-item">
          <strong>{heatmapData.filter(d => d.reviews > 0).length}</strong>
          <span>Days with Reviews</span>
        </div>
      </div>
    </div>
  );
}

export default HeatmapView;
