import React, { useState } from "react";
import {
  MapPin,
  Droplets,
  Wind,
  Eye,
  Thermometer,
  Gauge,
  Sun,
  Cloud,
  CloudSun,
  CloudRain,
  CloudLightning,
} from "lucide-react";
import { useWidgetContext } from "../../core/useWidgetContext";
import "./Weather.css";

const WEATHER_DATA = {
  current: {
    temp: 24,
    feelsLike: 22,
    condition: "Partly Cloudy",
    icon: CloudSun,
    humidity: 65,
    windSpeed: 12,
    visibility: 10,
    pressure: 1013,
    uvIndex: 6,
    location: "Lusaka, Zambia",
  },
  forecast: [
    { day: "Mon", icon: Sun, high: 28, low: 18 },
    { day: "Tue", icon: CloudSun, high: 26, low: 17 },
    { day: "Wed", icon: CloudRain, high: 22, low: 16 },
    { day: "Thu", icon: CloudLightning, high: 24, low: 15 },
    { day: "Fri", icon: Sun, high: 27, low: 19 },
    { day: "Sat", icon: Sun, high: 29, low: 20 },
    { day: "Sun", icon: CloudSun, high: 25, low: 18 },
  ],
};

export default function Weather({ mode, windowId, widgetType }) {
  const { current, forecast } = WEATHER_DATA;

  // Report live context for AI agents
  useWidgetContext(windowId, "weather", {
    location: current.location,
    temperature: current.temp,
    feelsLike: current.feelsLike,
    condition: current.condition,
    humidity: current.humidity,
    windSpeed: current.windSpeed,
    visibility: current.visibility,
    pressure: current.pressure,
    uvIndex: current.uvIndex,
    forecast: forecast.map((f) => ({ day: f.day, high: f.high, low: f.low })),
  });

  return (
    <div className="weather-widget">
      {/* Current Weather */}
      <div className="weather-current">
        <span className="weather-icon-large">
          <current.icon size={64} />
        </span>
        <div className="weather-temp-section">
          <span className="weather-temp">{current.temp}°</span>
          <span className="weather-condition">{current.condition}</span>
          <span className="weather-location">
            <MapPin size={12} /> {current.location}
          </span>
        </div>
      </div>

      {/* Details */}
      <div className="weather-details">
        <div className="weather-detail-card">
          <div className="weather-detail-icon">
            <Droplets />
          </div>
          <span className="weather-detail-label">Humidity</span>
          <span className="weather-detail-value">{current.humidity}%</span>
        </div>
        <div className="weather-detail-card">
          <div className="weather-detail-icon">
            <Wind />
          </div>
          <span className="weather-detail-label">Wind</span>
          <span className="weather-detail-value">{current.windSpeed} km/h</span>
        </div>
        <div className="weather-detail-card">
          <div className="weather-detail-icon">
            <Eye />
          </div>
          <span className="weather-detail-label">Visibility</span>
          <span className="weather-detail-value">{current.visibility} km</span>
        </div>
        <div className="weather-detail-card">
          <div className="weather-detail-icon">
            <Thermometer />
          </div>
          <span className="weather-detail-label">Feels Like</span>
          <span className="weather-detail-value">{current.feelsLike}°</span>
        </div>
        <div className="weather-detail-card">
          <div className="weather-detail-icon">
            <Gauge />
          </div>
          <span className="weather-detail-label">Pressure</span>
          <span className="weather-detail-value">{current.pressure}</span>
        </div>
        <div className="weather-detail-card">
          <span className="weather-detail-label">UV Index</span>
          <span className="weather-detail-value">{current.uvIndex}</span>
        </div>
      </div>

      {/* 7-day Forecast */}
      <div className="weather-forecast-title">7-Day Forecast</div>
      <div className="weather-forecast">
        {forecast.map((day, i) => (
          <div key={i} className="weather-forecast-day">
            <span className="weather-forecast-day-name">{day.day}</span>
            <span className="weather-forecast-day-icon">
              <day.icon size={24} />
            </span>
            <span className="weather-forecast-day-temp">{day.high}°</span>
            <span className="weather-forecast-day-low">{day.low}°</span>
          </div>
        ))}
      </div>
    </div>
  );
}
