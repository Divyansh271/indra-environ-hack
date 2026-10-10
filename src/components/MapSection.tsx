import React, { useState } from 'react';
import { LayerType } from '../types';

interface MapSectionProps {
  currentLocation: string;
}

interface SimplifiedZone {
  id: string;
  name: string;
  coords: string;
  layers: {
    aqi: { color: string; value: string; label: string };
    temperature: { color: string; value: string; label: string };
    flooding: { color: string; value: string; label: string };
  };
}

const ZONES: SimplifiedZone[] = [
  {
    id: 'dtu-core',
    name: 'DTU Academic Core',
    coords: 'M 180 40 L 320 40 L 320 140 L 180 140 Z',
    layers: {
      aqi: { color: '#eab308', value: '132 AQI', label: 'Moderate' }, // yellow
      temperature: { color: '#eab308', value: '33°C', label: 'Moderate' },
      flooding: { color: '#22c55e', value: 'Low Risk', label: 'Good Drainage' }, // green
    },
  },
  {
    id: 'dtu-green',
    name: 'DTU Green & Sports Area',
    coords: 'M 30 40 L 160 40 L 160 140 L 30 140 Z',
    layers: {
      aqi: { color: '#22c55e', value: '88 AQI', label: 'Good' }, // green
      temperature: { color: '#22c55e', value: '30°C', label: 'Cooler' },
      flooding: { color: '#22c55e', value: 'Low Risk', label: 'Dry' },
    },
  },
  {
    id: 'shahbad-village',
    name: 'Shahbad Daulatpur',
    coords: 'M 340 40 L 480 40 L 480 140 L 340 140 Z',
    layers: {
      aqi: { color: '#ef4444', value: '168 AQI', label: 'Unhealthy' }, // red
      temperature: { color: '#ef4444', value: '36°C', label: 'High Heat' },
      flooding: { color: '#ef4444', value: 'High Risk', label: 'Waterlogging' },
    },
  },
  {
    id: 'bawana-road',
    name: 'Bawana Road Transit',
    coords: 'M 30 160 L 240 160 L 240 230 L 30 230 Z',
    layers: {
      aqi: { color: '#ef4444', value: '192 AQI', label: 'Unhealthy' }, // red
      temperature: { color: '#ef4444', value: '38°C', label: 'High Heat' },
      flooding: { color: '#eab308', value: 'Moderate', label: 'Caution' },
    },
  },
  {
    id: 'canal-basin',
    name: 'Western Canal Drainage Basin',
    coords: 'M 260 160 L 480 160 L 480 230 L 260 230 Z',
    layers: {
      aqi: { color: '#eab308', value: '120 AQI', label: 'Moderate' }, // yellow
      temperature: { color: '#22c55e', value: '31°C', label: 'Normal' },
      flooding: { color: '#ef4444', value: 'High Risk', label: 'Overflow Warning' },
    },
  },
];

export const MapSection: React.FC<MapSectionProps> = ({ currentLocation }) => {
  const [activeLayer, setActiveLayer] = useState<LayerType>('aqi');
  const [selectedZone, setSelectedZone] = useState<SimplifiedZone | null>(null);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
      {/* Top Controls: Title, Layer Toggles */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Local Area Map Overview
          </h3>
          <p className="text-xs text-slate-500">
            Selected layer shows colored severity zones around {currentLocation}.
          </p>
        </div>

        {/* 3 Simple Layer Toggles */}
        <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setActiveLayer('aqi')}
            className={`rounded px-3 py-1 font-medium transition-colors cursor-pointer ${
              activeLayer === 'aqi'
                ? 'bg-white text-emerald-800 font-semibold shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            AQI
          </button>
          <button
            type="button"
            onClick={() => setActiveLayer('temperature')}
            className={`rounded px-3 py-1 font-medium transition-colors cursor-pointer ${
              activeLayer === 'temperature'
                ? 'bg-white text-emerald-800 font-semibold shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Temperature
          </button>
          <button
            type="button"
            onClick={() => setActiveLayer('flooding')}
            className={`rounded px-3 py-1 font-medium transition-colors cursor-pointer ${
              activeLayer === 'flooding'
                ? 'bg-white text-emerald-800 font-semibold shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Flooding
          </button>
        </div>
      </div>

      {/* Compact Stylized Map Placeholder */}
      <div className="relative w-full h-56 sm:h-64 rounded-md border border-slate-100 bg-slate-50 overflow-hidden flex items-center justify-center">
        <svg
          viewBox="0 0 510 250"
          className="w-full h-full max-h-64 object-contain select-none p-2"
        >
          {/* Subtle background roads / divisions */}
          <line x1="20" y1="150" x2="490" y2="150" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="4 4" />
          <line x1="250" y1="20" x2="250" y2="240" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="4 4" />

          {/* Zones */}
          {ZONES.map((zone) => {
            const currentData = zone.layers[activeLayer];
            const isSelected = selectedZone?.id === zone.id;

            return (
              <g
                key={zone.id}
                onClick={() => setSelectedZone(isSelected ? null : zone)}
                className="cursor-pointer"
              >
                <path
                  d={zone.coords}
                  fill={currentData.color}
                  fillOpacity="0.4"
                  stroke={isSelected ? '#0f172a' : currentData.color}
                  strokeWidth={isSelected ? '2.5' : '1.5'}
                  rx="6"
                  className="transition-all hover:fill-opacity-60"
                />
                {/* Zone Label & Value */}
                <text
                  x={
                    zone.id === 'dtu-green'
                      ? 95
                      : zone.id === 'dtu-core'
                      ? 250
                      : zone.id === 'shahbad-village'
                      ? 410
                      : zone.id === 'bawana-road'
                      ? 135
                      : 370
                  }
                  y={zone.coords.includes('40') ? 85 : 190}
                  textAnchor="middle"
                  fill="#1e293b"
                  fontSize="10"
                  fontWeight="600"
                >
                  {zone.name}
                </text>
                <text
                  x={
                    zone.id === 'dtu-green'
                      ? 95
                      : zone.id === 'dtu-core'
                      ? 250
                      : zone.id === 'shahbad-village'
                      ? 410
                      : zone.id === 'bawana-road'
                      ? 135
                      : 370
                  }
                  y={zone.coords.includes('40') ? 105 : 210}
                  textAnchor="middle"
                  fill="#0f172a"
                  fontSize="11"
                  fontWeight="bold"
                >
                  {currentData.value} ({currentData.label})
                </text>
              </g>
            );
          })}
        </svg>

        {/* Selected Zone Brief Info Pill */}
        {selectedZone && (
          <div className="absolute bottom-2 left-2 right-2 sm:right-auto sm:max-w-xs rounded border border-slate-200 bg-white/95 px-3 py-1.5 text-xs text-slate-800 shadow-xs">
            <span className="font-semibold">{selectedZone.name}:</span>{' '}
            <span>
              {selectedZone.layers[activeLayer].value} (
              {selectedZone.layers[activeLayer].label})
            </span>
          </div>
        )}
      </div>

      {/* Compact Legend: Green / Yellow / Red */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate-600">
        <div className="flex items-center gap-4">
          <span className="text-[11px] font-medium text-slate-500 uppercase">
            Severity:
          </span>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
            <span>Good / Low Risk</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />
            <span>Moderate</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            <span>High Risk</span>
          </div>
        </div>

        <span className="text-[11px] text-slate-400">
          Click any zone to focus
        </span>
      </div>
    </div>
  );
};
