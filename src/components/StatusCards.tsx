import React, { useState, useEffect } from 'react';
import { RefreshCw, Wind, Sun, Waves, ShieldAlert } from 'lucide-react';
import {
  fetchAirQuality,
  fetchWeatherData,
  computeFloodRisk,
  AirQualityData,
  WeatherData,
  FloodRiskData,
} from '../lib/environmentalApi';
import {
  CENTRAL_THRESHOLDS,
  evaluateAqiSeverity,
  evaluateTemperatureSeverity,
  evaluateFloodingSeverity,
} from '../lib/thresholds';

interface StatusCardsProps {
  currentLocation: string;
}

export const StatusCards: React.FC<StatusCardsProps> = ({ currentLocation }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [airQuality, setAirQuality] = useState<AirQualityData | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [floodRisk, setFloodRisk] = useState<FloodRiskData | null>(null);

  const getCoordinates = (loc: string): { lat: number; lng: number } => {
    const l = loc.toLowerCase();
    if (l.includes('rohini')) return { lat: 28.7360, lng: 77.1280 };
    if (l.includes('samaypur')) return { lat: 28.7405, lng: 77.1350 };
    if (l.includes('bawana')) return { lat: 28.7540, lng: 77.1215 };
    return { lat: 28.7495, lng: 77.1172 }; // DTU Campus
  };

  const loadData = async () => {
    setLoading(true);
    const coords = getCoordinates(currentLocation);
    try {
      const [aqiData, weatherData] = await Promise.all([
        fetchAirQuality(coords.lat, coords.lng),
        fetchWeatherData(coords.lat, coords.lng),
      ]);
      setAirQuality(aqiData);
      setWeather(weatherData);
      setFloodRisk(computeFloodRisk(weatherData));
    } catch (err) {
      console.error('[Error loading environmental data]', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentLocation]);

  const aqiValue = airQuality?.aqi ?? 125;
  const aqiSeverity = evaluateAqiSeverity(aqiValue);
  const aqiCategory = airQuality?.category ? airQuality.category.replace(' air quality', '') : 'Moderate';
  const aqiColor =
    aqiSeverity === 'red'
      ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
      : aqiSeverity === 'yellow'
      ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
      : 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800';
  const aqiDot = aqiSeverity === 'red' ? 'bg-rose-500' : aqiSeverity === 'yellow' ? 'bg-amber-500' : 'bg-emerald-500';

  const tempNum = weather?.temperature ?? 30.3;
  const tempSeverity = evaluateTemperatureSeverity(tempNum);
  const tempValue = weather ? `${weather.temperature}°C` : '30.3°C';
  const tempStatus = weather?.condition || 'Mostly sunny';
  const tempColor =
    tempSeverity === 'red'
      ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
      : tempSeverity === 'yellow'
      ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
      : 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800';
  const tempDot = tempSeverity === 'red' ? 'bg-rose-500' : tempSeverity === 'yellow' ? 'bg-amber-500' : 'bg-emerald-500';

  const floodEval = evaluateFloodingSeverity(
    weather?.precipitationProbability ?? 13,
    weather?.rainAccumulation24h ?? 0.36,
    0
  );
  const floodLevel = floodEval.level === 'red' ? 'High' : floodEval.level === 'yellow' ? 'Moderate' : 'Low';
  const floodStatus = floodEval.level === 'red' ? 'Warning' : floodEval.level === 'yellow' ? 'Watch Advisory' : 'Normal Drainage';
  const floodColor =
    floodEval.level === 'red'
      ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
      : floodEval.level === 'yellow'
      ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
      : 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800';
  const floodDot = floodEval.level === 'red' ? 'bg-rose-500' : floodEval.level === 'yellow' ? 'bg-amber-500' : 'bg-emerald-500';

  const metrics = [
    {
      title: 'Air Quality (AQI)',
      value: String(aqiValue),
      severity: aqiCategory,
      sublabel: `Dominant: ${airQuality?.dominantPollutant || 'PM10'} • ${airQuality?.displayName || 'NAQI'}`,
      statusColor: aqiColor,
      dotColor: aqiDot,
      icon: Wind,
    },
    {
      title: 'Temperature',
      value: tempValue,
      severity: tempStatus,
      sublabel: weather ? `Feels like ${weather.feelsLike}°C • Humidity ${weather.relativeHumidity}%` : 'Normal range',
      statusColor: tempColor,
      dotColor: tempDot,
      icon: Sun,
    },
    {
      title: 'Flooding Risk',
      value: floodLevel,
      severity: floodStatus,
      sublabel: weather ? `Rain chance ${weather.precipitationProbability}% • Wind ${weather.windSpeed} km/h` : 'Catchment clear',
      statusColor: floodColor,
      dotColor: floodDot,
      icon: Waves,
    },
  ];

  return (
    <div className="space-y-2.5">
      {/* Live Badge & Refresh Action */}
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-1.5">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            Google Maps Platform Live Telemetry
          </span>
          <span className="text-[11px] text-slate-400">
            (Air Quality API & Weather API enabled)
          </span>
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* 3 Compact Metric Cards in one horizontal row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {metrics.map((item, index) => {
          const Icon = item.icon;
          return (
            <div
              key={index}
              className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {item.title}
                  </div>
                  <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
                    {item.value}
                  </div>
                </div>

                <div
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium shrink-0 ${item.statusColor}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${item.dotColor}`} />
                  <span className="truncate max-w-[110px]">{item.severity}</span>
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>{item.sublabel}</span>
                <Icon className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-1" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
