import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Calendar, BookOpen } from 'lucide-react';

function StatsView({ stats }) {
  const [schedule, setSchedule] = useState([]);

  useEffect(() => {
    loadSchedule();
  }, []);

  const loadSchedule = async () => {
    const data = await window.api.stats.getSchedule(30);
    setSchedule(data);
  };

  if (!stats) return <div>Loading stats...</div>;

  return (
    <div className="stats-view">
      <h2>Statistics</h2>

      <div className="stats-grid">
        <div className="stat-card">
          <BookOpen size={32} />
          <h3>{stats.notesCount}</h3>
          <p>Total Notes</p>
        </div>
        <div className="stat-card">
          <BarChart3 size={32} />
          <h3>{stats.cardsCount}</h3>
          <p>Total Cards</p>
        </div>
        <div className="stat-card">
          <TrendingUp size={32} />
          <h3>{stats.totalReviews}</h3>
          <p>Total Reviews</p>
        </div>
        <div className="stat-card">
          <Calendar size={32} />
          <h3>{stats.dueCards}</h3>
          <p>Due Today</p>
        </div>
      </div>

      <div className="stats-details">
        <div className="stat-row">
          <span>New Cards:</span>
          <strong>{stats.newCards}</strong>
        </div>
        <div className="stat-row">
          <span>Average Difficulty:</span>
          <strong>{stats.avgDifficulty.toFixed(2)}</strong>
        </div>
        <div className="stat-row">
          <span>Average Stability:</span>
          <strong>{stats.avgStability.toFixed(1)} days</strong>
        </div>
      </div>

      <div className="schedule-chart">
        <h3>Upcoming Reviews (30 days)</h3>
        <div className="chart-bars">
          {schedule.map((day, idx) => (
            <div key={idx} className="chart-bar-container">
              <div
                className="chart-bar"
                style={{ height: `${Math.min((day.count / Math.max(...schedule.map(d => d.count))) * 100, 100)}%` }}
                title={`${day.date}: ${day.count} cards`}
              />
              {idx % 5 === 0 && <span className="chart-label">{new Date(day.date).getDate()}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default StatsView;
