import React, { useState } from 'react';
import {
  MapPin,
  CheckCircle2,
  Loader2,
  Search,
  ArrowLeft,
  X,
} from 'lucide-react';
import { SAMPLE_LOCATIONS, INITIAL_LOCATION } from '../data/dummyData';

interface LocationConsentModalProps {
  isOpen: boolean;
  onLocationSelected: (locationName: string) => void;
  onClose?: () => void;
  canDismiss?: boolean;
  initialMode?: 'consent' | 'manual';
}

export const LocationConsentModal: React.FC<LocationConsentModalProps> = ({
  isOpen,
  onLocationSelected,
  onClose,
  canDismiss = false,
  initialMode = 'consent',
}) => {
  const [view, setView] = useState<'consent' | 'manual'>(initialMode);
  const [isDetecting, setIsDetecting] = useState<boolean>(false);
  const [detectionSuccess, setDetectionSuccess] = useState<boolean>(false);
  const [manualInput, setManualInput] = useState<string>('');
  const [selectedSample, setSelectedSample] = useState<string>('');
  const [inputError, setInputError] = useState<string>('');

  if (!isOpen) return null;

  const handleSimulateDetection = () => {
    setIsDetecting(true);
    setDetectionSuccess(false);

    // Simulate location detection without browser API
    setTimeout(() => {
      setIsDetecting(false);
      setDetectionSuccess(true);

      setTimeout(() => {
        onLocationSelected(INITIAL_LOCATION);
      }, 700);
    }, 1100);
  };

  const handleSelectSample = (name: string) => {
    setSelectedSample(name);
    setManualInput(name);
    setInputError('');
  };

  const handleManualConfirm = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const finalLocation = manualInput.trim();
    if (!finalLocation) {
      setInputError('Please enter or select a location.');
      return;
    }
    setInputError('');
    onLocationSelected(finalLocation);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-md rounded-xl bg-white border border-slate-200 shadow-lg p-6">
        {/* Optional close button if location already set */}
        {canDismiss && onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {view === 'consent' ? (
          <div>
            <div className="flex items-center gap-2 mb-2 text-emerald-700">
              <MapPin className="h-5 w-5" />
              <span className="text-xs font-semibold uppercase tracking-wider">
                Location Setup
              </span>
            </div>

            <h2 className="text-lg font-bold text-slate-900">
              Discover Environmental Conditions Near You
            </h2>

            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              EnviroWatch uses your approximate area to show local air quality, temperature, and flooding conditions.
            </p>

            {/* Detection status */}
            {isDetecting && (
              <div className="mt-4 flex items-center gap-2.5 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                <span>Detecting your location...</span>
              </div>
            )}

            {detectionSuccess && (
              <div className="mt-4 flex items-center gap-2.5 rounded-md border border-emerald-300 bg-emerald-100 p-3 text-sm text-emerald-800">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Location detected successfully.</span>
              </div>
            )}

            {/* Buttons */}
            {!isDetecting && !detectionSuccess && (
              <div className="mt-5 space-y-2.5">
                <button
                  type="button"
                  onClick={handleSimulateDetection}
                  className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors cursor-pointer"
                >
                  Allow Location Access
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setView('manual');
                    setInputError('');
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Enter Location Manually
                </button>
              </div>
            )}

            <p className="mt-4 text-center text-xs text-slate-500">
              Your exact location will not be displayed publicly.
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
              <button
                type="button"
                onClick={() => setView('consent')}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back</span>
              </button>
              <span className="text-xs text-slate-400">Manual Selection</span>
            </div>

            <h3 className="text-base font-bold text-slate-900">
              Enter or Select Location
            </h3>

            <form onSubmit={handleManualConfirm} className="mt-3 space-y-3">
              <div>
                <input
                  type="text"
                  value={manualInput}
                  onChange={(e) => {
                    setManualInput(e.target.value);
                    setInputError('');
                  }}
                  placeholder="Enter your area or neighborhood"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  autoFocus
                />
                {inputError && (
                  <p className="mt-1 text-xs text-red-600">{inputError}</p>
                )}
              </div>

              <div>
                <div className="text-xs font-medium text-slate-500 mb-1.5">
                  Sample locations:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SAMPLE_LOCATIONS.map((loc) => {
                    const isSelected = selectedSample === loc.name || manualInput === loc.name;
                    return (
                      <button
                        type="button"
                        key={loc.id}
                        onClick={() => handleSelectSample(loc.name)}
                        className={`rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {loc.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setView('consent')}
                  className="rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!manualInput.trim()}
                  className="flex-1 rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  Confirm Location
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
