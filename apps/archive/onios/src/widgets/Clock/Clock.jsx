import React, { useState, useEffect } from "react";
import "./Clock.css";

export default function Clock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = time.getHours();
  const minutes = time.getMinutes();
  const seconds = time.getSeconds();

  const hourDeg = (hours % 12) * 30 + minutes * 0.5;
  const minuteDeg = minutes * 6 + seconds * 0.1;
  const secondDeg = seconds * 6;

  const formatTime = (d) =>
    d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  const formatDate = (d) =>
    d.toLocaleDateString([], {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  // Generate clock markers
  const markers = [];
  for (let i = 0; i < 12; i++) {
    markers.push(
      <div
        key={i}
        className={`clock-marker ${i % 3 === 0 ? "major" : ""}`}
        style={{ transform: `rotate(${i * 30}deg)` }}
      />,
    );
  }

  return (
    <div className="clock-widget">
      {/* Analog Clock */}
      <div className="clock-analog">
        <div className="clock-face">
          {markers}
          <div
            className="clock-hand clock-hour"
            style={{ transform: `rotate(${hourDeg}deg)` }}
          />
          <div
            className="clock-hand clock-minute"
            style={{ transform: `rotate(${minuteDeg}deg)` }}
          />
          <div
            className="clock-hand clock-second"
            style={{ transform: `rotate(${secondDeg}deg)` }}
          />
          <div className="clock-center-dot" />
        </div>
      </div>

      {/* Digital */}
      <div className="clock-digital">
        <div className="clock-time">{formatTime(time)}</div>
        <div className="clock-date">{formatDate(time)}</div>
      </div>

      {/* System Info */}
      <div className="clock-system-info">
        <div className="clock-info-card">
          <span className="clock-info-label">CPU</span>
          <span className="clock-info-value">
            {Math.floor(Math.random() * 15 + 5)}%
          </span>
        </div>
        <div className="clock-info-card">
          <span className="clock-info-label">Memory</span>
          <span className="clock-info-value">
            {Math.floor(Math.random() * 20 + 40)}%
          </span>
        </div>
        <div className="clock-info-card">
          <span className="clock-info-label">Widgets</span>
          <span className="clock-info-value">Active</span>
        </div>
        <div className="clock-info-card">
          <span className="clock-info-label">Network</span>
          <span className="clock-info-value">Online</span>
        </div>
      </div>
    </div>
  );
}
