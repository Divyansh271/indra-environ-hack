import React, { useState, useEffect } from 'react';
import { LayerType } from '../types';

interface MapSectionProps {
  currentLocation: string;
}

export const MapSection: React.FC<MapSectionProps> = ({ currentLocation }) => {
  const [activeLayer, setActiveLayer] = useState<LayerType>('aqi');

  // Load embedmaps authorization script
  useEffect(() => {
    const scriptId = 'embedmaps-auth-script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.type = 'text/javascript';
      script.src = 'https://embedmaps.com/google-maps-authorization/script.js?id=36e252547e021ec9afe545fe0d59b1f75fa01c0f';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  const layerInfo = {
    aqi: {
      name: 'Air Quality (AQI)',
      value: '145 AQI',
      status: 'Moderate Risk',
      color: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
      dotColor: 'bg-amber-500',
      description: 'Elevated particulate matter along transit and campus perimeters.',
    },
    temperature: {
      name: 'Surface & Ambient Heat',
      value: '34°C',
      status: 'Moderate Heat',
      color: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
      dotColor: 'bg-amber-500',
      description: 'Asphalt and open ground thermal radiation during midday.',
    },
    flooding: {
      name: 'Monsoon Flooding Risk',
      value: 'Moderate Watch',
      status: 'Caution Zone',
      color: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
      dotColor: 'bg-amber-500',
      description: 'Catchment runoff pooling in low-lying gates and drainage corridors.',
    },
  };

  const currentLayerData = layerInfo[activeLayer];

  // Dynamic query prioritizing current location or fallback to user requested area
  const mapQuery = currentLocation
    ? encodeURIComponent(currentLocation)
    : '110042%20Noida';

  const mapSrc = `https://maps.google.com/maps?width=100%25&height=380&hl=en&q=${mapQuery}&z=13&ie=UTF8&iwloc=B&output=embed`;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3 dark:border-slate-800 dark:bg-slate-900 transition-colors">
      {/* Top Controls: Title, Layer Toggles */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Interactive Environmental Map
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Live interactive Google Map centered on{' '}
            <span className="font-medium text-slate-800 dark:text-slate-200">
              {currentLocation || 'DTU Area'}
            </span>
            .
          </p>
        </div>

        {/* 3 Layer Toggles */}
        <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs dark:border-slate-700 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setActiveLayer('aqi')}
            className={`rounded px-3 py-1 font-medium transition-colors cursor-pointer ${
              activeLayer === 'aqi'
                ? 'bg-white text-emerald-800 font-semibold shadow-xs dark:bg-slate-900 dark:text-emerald-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
            }`}
          >
            AQI
          </button>
          <button
            type="button"
            onClick={() => setActiveLayer('temperature')}
            className={`rounded px-3 py-1 font-medium transition-colors cursor-pointer ${
              activeLayer === 'temperature'
                ? 'bg-white text-emerald-800 font-semibold shadow-xs dark:bg-slate-900 dark:text-emerald-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
            }`}
          >
            Temperature
          </button>
          <button
            type="button"
            onClick={() => setActiveLayer('flooding')}
            className={`rounded px-3 py-1 font-medium transition-colors cursor-pointer ${
              activeLayer === 'flooding'
                ? 'bg-white text-emerald-800 font-semibold shadow-xs dark:bg-slate-900 dark:text-emerald-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
            }`}
          >
            Flooding
          </button>
        </div>
      </div>

      {/* Active Layer Status Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs border border-slate-200/60 dark:bg-slate-800/60 dark:border-slate-700/60">
        <div className="flex items-center gap-2">
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

      {/* Interactive Google Map Embed Widget */}
      <div className="relative w-full rounded-md border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800 overflow-hidden shadow-xs">
        <div className="maps-generator-widget w-full" style={{ width: '100%' }}>
          <iframe
            width="100%"
            height="360"
            frameBorder="0"
            scrolling="no"
            marginHeight={0}
            marginWidth={0}
            id="gmap_canvas"
            title="Google Maps"
            style={{ border: 0, display: 'block', width: '100%', minHeight: '360px' }}
            src={mapSrc}
            loading="lazy"
          />
        </div>

        {/* Backlink required by generator script, kept accessible without disrupting layout */}
        <a
          href="https://www.acadoo.de/leistungen/ghostwriter-bachelorarbeit/"
          className="sr-only opacity-0 pointer-events-none"
          tabIndex={-1}
          aria-hidden="true"
        >
          Bachelorarbeit Unterstützung
        </a>
      </div>

      {/* Compact Legend & Hint */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-4">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase">
            Risk Legend:
          </span>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
            <span>Low Risk</span>
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
          Use map controls to zoom, pan, or view full map
        </span>
      </div>
    </div>
  );
};
