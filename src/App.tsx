import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { StatusCards } from './components/StatusCards';
import { MapSection } from './components/MapSection';
import { Footer } from './components/Footer';
import { LocationConsentModal } from './components/LocationConsentModal';
import { AuthModal } from './components/AuthModal';
import { UserSession } from './types';
import { INITIAL_LOCATION } from './data/dummyData';
import { MapPin, RefreshCw } from 'lucide-react';

export default function App() {
  // First-visit location consent state
  const [hasLocationConsent, setHasLocationConsent] = useState<boolean>(false);
  const [currentLocation, setCurrentLocation] = useState<string>('');
  const [isLocationModalOpen, setIsLocationModalOpen] = useState<boolean>(true);
  const [locationModalMode, setLocationModalMode] = useState<'consent' | 'manual'>('consent');

  // Authentication State (frontend simulation only)
  const [user, setUser] = useState<UserSession | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');

  // Brief toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  const handleLocationSelected = (selectedLoc: string) => {
    setCurrentLocation(selectedLoc);
    setHasLocationConsent(true);
    setIsLocationModalOpen(false);
    showToast(`Location set: ${selectedLoc}`);
  };

  const handleOpenChangeLocation = () => {
    setLocationModalMode('manual');
    setIsLocationModalOpen(true);
  };

  const handleOpenLogin = () => {
    setAuthMode('login');
    setIsAuthModalOpen(true);
  };

  const handleOpenSignup = () => {
    setAuthMode('signup');
    setIsAuthModalOpen(true);
  };

  const handleAuthSuccess = (authenticatedUser: UserSession) => {
    setUser(authenticatedUser);
    showToast(`Welcome, ${authenticatedUser.name}!`);
  };

  const handleLogout = () => {
    setUser(null);
    showToast('Logged out successfully.');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans antialiased">
      {/* Toast Banner */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 rounded-md bg-slate-900 px-3.5 py-2 text-xs font-medium text-white shadow-md">
          {toastMessage}
        </div>
      )}

      {/* Mandatory First-Visit Location Consent Modal */}
      <LocationConsentModal
        isOpen={isLocationModalOpen}
        initialMode={locationModalMode}
        canDismiss={hasLocationConsent}
        onClose={() => setIsLocationModalOpen(false)}
        onLocationSelected={handleLocationSelected}
      />

      {/* Optional Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        initialMode={authMode}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />

      {/* Screen prior to location consent */}
      {!hasLocationConsent ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 font-bold text-lg mb-3">
            Z
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            Welcome to Zeus
          </h1>
          <p className="mt-1 text-xs text-slate-500 max-w-sm">
            Please select your location to view local environmental conditions.
          </p>
          <button
            onClick={() => setIsLocationModalOpen(true)}
            className="mt-4 rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors cursor-pointer"
          >
            Open Location Setup
          </button>
        </div>
      ) : (
        /* Minimal Clean Dashboard */
        <>
          <Navbar
            currentLocation={currentLocation}
            user={user}
            onChangeLocation={handleOpenChangeLocation}
            onOpenLogin={handleOpenLogin}
            onOpenSignup={handleOpenSignup}
            onLogout={handleLogout}
          />

          <main className="flex-1 mx-auto w-full max-w-5xl px-4 sm:px-6 pt-5 pb-8 space-y-5">
            {/* Compact Header Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
              <div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Environmental Dashboard
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Monitoring area: <span className="font-medium text-slate-800">{currentLocation}</span>
                </p>
              </div>

              <button
                onClick={handleOpenChangeLocation}
                className="self-start sm:self-auto inline-flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <RefreshCw className="h-3 w-3 text-emerald-600" />
                <span>Change Area</span>
              </button>
            </div>

            {/* Exactly Three Primary Environmental Metrics (Compact) */}
            <StatusCards currentLocation={currentLocation} />

            {/* Simplified Map with 3 layer toggles and compact legend */}
            <MapSection currentLocation={currentLocation} />
          </main>

          <Footer />
        </>
      )}
    </div>
  );
}
