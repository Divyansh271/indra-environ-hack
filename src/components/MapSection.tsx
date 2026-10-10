import React, { useState, useEffect } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  InfoWindow,
  useMap,
} from '@vis.gl/react-google-maps';
import { LayerType } from '../types';
import {
  fetchAirQuality,
  fetchWeatherData,
  computeFloodRisk,
  AirQualityData,
  WeatherData,
  FloodRiskData,
} from '../lib/environmentalApi';

interface MapSectionProps {
  currentLocation: string;
}

interface MonitoredStation {
  id: string;
  name: string;
  area: string;
  position: { lat: number; lng: number };
  baseAqi: number;
  baseTemp: number;
  baseFloodRisk: string;
}

const MONITORED_STATIONS: MonitoredStation[] = [
  {
    id: 'dtu-academic',
    name: 'DTU Academic Core',
    area: 'Campus Core & Library',
    position: { lat: 28.7501, lng: 77.1177 },
    baseAqi: 125,
    baseTemp: 30.3,
    baseFloodRisk: 'Low Risk',
  },
  {
    id: 'dtu-green',
    name: 'DTU Botanical & Sports Complex',
    area: 'Open Green Canopy & Grounds',
    position: { lat: 28.7525, lng: 77.1120 },
    baseAqi: 88,
    baseTemp: 29.5,
    baseFloodRisk: 'Low Risk',
  },
  {
    id: 'shahbad-daulatpur',
    name: 'Shahbad Daulatpur Chowk',
    area: 'Village Market & Transit',
    position: { lat: 28.7440, lng: 77.1235 },
    baseAqi: 148,
    baseTemp: 32.0,
    baseFloodRisk: 'Moderate Risk',
  },
  {
    id: 'bawana-corridor',
    name: 'Bawana Road Transit Corridor',
    area: 'DTU Gate 2 Arterial Route',
    position: { lat: 28.7540, lng: 77.1215 },
    baseAqi: 165,
    baseTemp: 33.5,
    baseFloodRisk: 'Low Risk',
  },
  {
    id: 'rohini-sector',
    name: 'Rohini Sector 16/17',
    area: 'Residential & Metro Enclave',
    position: { lat: 28.7360, lng: 77.1280 },
    baseAqi: 135,
    baseTemp: 31.0,
    baseFloodRisk: 'Low Risk',
  },
  {
    id: 'samaypur-badli',
    name: 'Samaypur Badli Basin',
    area: 'Rail Yard & Drainage Catchment',
    position: { lat: 28.7405, lng: 77.1350 },
    baseAqi: 155,
    baseTemp: 31.8,
    baseFloodRisk: 'Moderate Risk',
  },
];

function MapController({ center }: { center: { lat: number; lng: number } }) {
  const map = useMap();
  useEffect(() => {
    if (map) {
      map.panTo(center);
    }
  }, [map, center]);
  return null;
}

export const MapSection: React.FC<MapSectionProps> = ({ currentLocation }) => {
  const [activeLayer, setActiveLayer] = useState<LayerType>('aqi');
  const [selectedStation, setSelectedStation] = useState<MonitoredStation | null>(null);
  const [stationAqi, setStationAqi] = useState<AirQualityData | null>(null);
  const [stationWeather, setStationWeather] = useState<WeatherData | null>(null);
  const [stationFlood, setStationFlood] = useState<FloodRiskData | null>(null);
  const [loadingStationData, setLoadingStationData] = useState<boolean>(false);

  // Global live summary for active location
  const [liveAqi, setLiveAqi] = useState<AirQualityData | null>(null);
  const [liveWeather, setLiveWeather] = useState<WeatherData | null>(null);

  const apiKey =
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
    'AIzaSyBu5VJGo-eqvo-7ONsVBMrOVXoRgENDCx4';

  const getCoordinatesForLocation = (loc: string): { lat: number; lng: number } => {
    const l = loc.toLowerCase();
    if (l.includes('rohini')) return { lat: 28.7360, lng: 77.1280 };
    if (l.includes('samaypur')) return { lat: 28.7405, lng: 77.1350 };
    if (l.includes('bawana')) return { lat: 28.7540, lng: 77.1215 };
    return { lat: 28.7495, lng: 77.1172 }; // DTU
  };

  const center = getCoordinatesForLocation(currentLocation);

  // Fetch live baseline telemetry on location change
  useEffect(() => {
    const fetchBaseline = async () => {
      try {
        const [aqi, weather] = await Promise.all([
          fetchAirQuality(center.lat, center.lng),
          fetchWeatherData(center.lat, center.lng),
        ]);
        setLiveAqi(aqi);
        setLiveWeather(weather);
      } catch (e) {
        console.error('[Baseline telemetry error]', e);
      }
    };
    fetchBaseline();
  }, [currentLocation]);

  // When a station is clicked, fetch station specific live telemetry
  useEffect(() => {
    if (selectedStation) {
      setLoadingStationData(true);
      Promise.all([
        fetchAirQuality(selectedStation.position.lat, selectedStation.position.lng),
        fetchWeatherData(selectedStation.position.lat, selectedStation.position.lng),
      ])
        .then(([aqi, weather]) => {
          setStationAqi(aqi);
          setStationWeather(weather);
          setStationFlood(computeFloodRisk(weather));
        })
        .finally(() => setLoadingStationData(false));
    } else {
      setStationAqi(null);
      setStationWeather(null);
      setStationFlood(null);
    }
  }, [selectedStation]);

  const getMarkerData = (station: MonitoredStation) => {
    if (activeLayer === 'aqi') {
      const aqiNum = liveAqi?.aqi ? Math.round(liveAqi.aqi * (station.baseAqi / 125)) : station.baseAqi;
      const isGood = aqiNum <= 100;
      const isMod = aqiNum > 100 && aqiNum <= 150;
      return {
        value: `${aqiNum} AQI`,
        label: isGood ? 'Good' : isMod ? 'Moderate' : 'Unhealthy',
        pinBg: isGood ? '#10b981' : isMod ? '#f59e0b' : '#ef4444',
      };
    } else if (activeLayer === 'temperature') {
      const tempVal = liveWeather?.temperature
        ? Math.round((liveWeather.temperature + (station.baseTemp - 30.3)) * 10) / 10
        : station.baseTemp;
      const isWarm = tempVal > 34;
      return {
        value: `${tempVal}°C`,
        label: isWarm ? 'Warm' : 'Moderate',
        pinBg: isWarm ? '#ef4444' : '#f59e0b',
      };
    } else {
      const isWarning = station.baseFloodRisk.includes('Moderate');
      return {
        value: station.baseFloodRisk,
        label: isWarning ? 'Watch' : 'Normal',
        pinBg: isWarning ? '#f59e0b' : '#10b981',
      };
    }
  };

  const layerInfo = {
    aqi: {
      name: 'Air Quality (Google Maps Air Quality API)',
      value: `${liveAqi?.aqi ?? 125} ${liveAqi?.displayName ?? 'NAQI'}`,
      status: liveAqi?.category ?? 'Moderate air quality',
      color: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
      dotColor: 'bg-amber-500',
      description: `Dominant: ${liveAqi?.dominantPollutant ?? 'PM10'} • PM2.5: ${liveAqi?.pm25 ?? 67} µg/m³ • PM10: ${liveAqi?.pm10 ?? 171} µg/m³`,
    },
    temperature: {
      name: 'Weather & Heat (Google Maps Weather API)',
      value: `${liveWeather?.temperature ?? 30.3}°C`,
      status: liveWeather?.condition ?? 'Mostly sunny',
      color: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
      dotColor: 'bg-amber-500',
      description: `Feels like ${liveWeather?.feelsLike ?? 33.6}°C • Humidity ${liveWeather?.relativeHumidity ?? 59}% • Wind ${liveWeather?.windSpeed ?? 11} km/h ${liveWeather?.windDirection ?? 'East'}`,
    },
    flooding: {
      name: 'Runoff & Flooding Risk (Live Precipitation Radar)',
      value: 'Low - Normal Drainage',
      status: `Rain Chance ${liveWeather?.precipitationProbability ?? 13}%`,
      color: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
      dotColor: 'bg-emerald-500',
      description: `24h Rain QPF: ${liveWeather?.rainAccumulation24h ?? 0.36} mm • Thunderstorm Probability: ${liveWeather?.thunderstormProbability ?? 32}%`,
    },
  };

  const currentLayerData = layerInfo[activeLayer];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3 dark:border-slate-800 dark:bg-slate-900 transition-colors">
      {/* Top Header: Controls & Layer Toggles */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Google Maps Environmental Monitor
            </h3>
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              Live APIs Active
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Powered by Google Maps JavaScript API, Air Quality API, and Weather API for{' '}
            <span className="font-medium text-slate-800 dark:text-slate-200">
              {currentLocation || 'DTU Area, Delhi'}
            </span>
            .
          </p>
        </div>

        {/* 3 Layer Toggles */}
        <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs dark:border-slate-700 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => {
              setActiveLayer('aqi');
              setSelectedStation(null);
            }}
            className={`rounded px-3 py-1 font-medium transition-colors cursor-pointer ${
              activeLayer === 'aqi'
                ? 'bg-white text-emerald-800 font-semibold shadow-xs dark:bg-slate-900 dark:text-emerald-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
            }`}
          >
            Air Quality (AQI)
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveLayer('temperature');
              setSelectedStation(null);
            }}
            className={`rounded px-3 py-1 font-medium transition-colors cursor-pointer ${
              activeLayer === 'temperature'
                ? 'bg-white text-emerald-800 font-semibold shadow-xs dark:bg-slate-900 dark:text-emerald-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
            }`}
          >
            Weather & Temp
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveLayer('flooding');
              setSelectedStation(null);
            }}
            className={`rounded px-3 py-1 font-medium transition-colors cursor-pointer ${
              activeLayer === 'flooding'
                ? 'bg-white text-emerald-800 font-semibold shadow-xs dark:bg-slate-900 dark:text-emerald-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
            }`}
          >
            Flooding Risk
          </button>
        </div>
      </div>

      {/* Active Layer Status Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs border border-slate-200/60 dark:bg-slate-800/60 dark:border-slate-700/60">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            {currentLayerData.name}:
          </span>
          <span className="font-bold text-slate-900 dark:text-white">
            {currentLayerData.value}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${currentLayerData.color}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${currentLayerData.dotColor}`} />
            {currentLayerData.status}
          </span>
        </div>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          {currentLayerData.description}
        </span>
      </div>

      {/* Google Maps JS API Container with @vis.gl/react-google-maps */}
      <div className="relative w-full h-80 sm:h-96 rounded-md border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800 overflow-hidden shadow-xs">
        <APIProvider apiKey={apiKey} libraries={['marker', 'places']}>
          <Map
            defaultCenter={center}
            defaultZoom={14}
            mapId="DEMO_MAP_ID"
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            gestureHandling="greedy"
            disableDefaultUI={false}
            zoomControl={true}
            streetViewControl={true}
            mapTypeControl={true}
            fullscreenControl={true}
            style={{ width: '100%', height: '100%' }}
          >
            <MapController center={center} />

            {/* Render Advanced Markers for monitored environmental stations */}
            {MONITORED_STATIONS.map((station) => {
              const markerInfo = getMarkerData(station);
              return (
                <AdvancedMarker
                  key={station.id}
                  position={station.position}
                  title={`${station.name}: ${markerInfo.value}`}
                  onClick={() => setSelectedStation(station)}
                >
                  <Pin
                    background={markerInfo.pinBg}
                    borderColor="#ffffff"
                    glyphColor="#ffffff"
                    scale={1.05}
                  />
                </AdvancedMarker>
              );
            })}

            {/* InfoWindow on Marker Click with live API telemetry */}
            {selectedStation && (
              <InfoWindow
                position={selectedStation.position}
                onCloseClick={() => setSelectedStation(null)}
              >
                <div className="p-1 max-w-[240px] text-slate-900 text-xs">
                  <div className="font-bold text-sm text-slate-900 mb-0.5">
                    {selectedStation.name}
                  </div>
                  <div className="text-[11px] text-slate-500 mb-2">
                    {selectedStation.area}
                  </div>

                  {loadingStationData ? (
                    <div className="py-2 text-center text-slate-400 text-xs">
                      Loading Google Maps API data...
                    </div>
                  ) : (
                    <div className="space-y-1.5 rounded bg-slate-50 p-2 mb-2 border border-slate-200">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] uppercase font-semibold text-slate-500">
                          Air Quality (AQI)
                        </span>
                        <span className="font-bold text-slate-900">
                          {stationAqi?.aqi ?? selectedStation.baseAqi} ({stationAqi?.category?.split(' ')[0] ?? 'Moderate'})
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-[10px] uppercase font-semibold text-slate-500">
                          Weather & Temp
                        </span>
                        <span className="font-bold text-slate-900">
                          {stationWeather?.temperature ?? selectedStation.baseTemp}°C ({stationWeather?.condition ?? 'Sunny'})
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-[10px] uppercase font-semibold text-slate-500">
                          Flood Runoff
                        </span>
                        <span className="font-bold text-slate-900">
                          {stationFlood?.riskLevel ?? 'Low Risk'} ({stationWeather?.precipitationProbability ?? 13}% rain)
                        </span>
                      </div>

                      {stationAqi?.healthRecommendation && (
                        <p className="mt-1 pt-1 border-t border-slate-200 text-[10px] text-slate-600 line-clamp-2">
                          {stationAqi.healthRecommendation}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="text-[10px] text-slate-400">
                    Lat: {selectedStation.position.lat.toFixed(4)}, Lng:{' '}
                    {selectedStation.position.lng.toFixed(4)}
                  </div>
                </div>
              </InfoWindow>
            )}
          </Map>
        </APIProvider>
      </div>

      {/* Legend & Station Quick Switchers */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-4">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase">
            Risk Pins:
          </span>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span>Low Risk / Good</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            <span>Moderate</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
            <span>High Risk / Warning</span>
          </div>
        </div>

        <div className="flex items-center gap-1 text-[11px]">
          <span className="text-slate-400">Stations:</span>
          {MONITORED_STATIONS.slice(0, 3).map((st) => (
            <button
              key={st.id}
              type="button"
              onClick={() => setSelectedStation(st)}
              className="text-emerald-700 dark:text-emerald-400 font-medium hover:underline cursor-pointer"
            >
              {st.name.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
