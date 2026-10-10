import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { StatusCards } from './components/StatusCards';
import { MapSection } from './components/MapSection';
import { Footer } from './components/Footer';
import { LocationConsentModal } from './components/LocationConsentModal';
import { AuthModal } from './components/AuthModal';
import { UserSession } from './types';
import { RefreshCw } from 'lucide-react';
import { getSupabaseClient } from './lib/supabase';

export default function App() {
  // Dark mode state: default light mode
  const [darkMode, setDarkMode] = useState<boolean>(false);

  // Sync dark class on document element
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const handleToggleDarkMode = () => {
    setDarkMode((prev) => !prev);
  };

  // First-visit location consent state
  const [hasLocationConsent, setHasLocationConsent] = useState<boolean>(false);
  const [currentLocation, setCurrentLocation] = useState<string>('');
  const [isLocationModalOpen, setIsLocationModalOpen] = useState<boolean>(true);
  const [locationModalMode, setLocationModalMode] = useState<'consent' | 'manual'>('consent');

  // Authentication State
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

  // Check and listen for active Supabase Auth session
  useEffect(() => {
    const client = getSupabaseClient();
    if (client) {
      client.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          const metadata = session.user.user_metadata;
          setUser({
            name: metadata?.full_name || metadata?.name || session.user.email?.split('@')[0] || 'User',
            email: session.user.email || '',
          });
        }
      });

      const {
        data: { subscription },
      } = client.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          const metadata = session.user.user_metadata;
          setUser({
            name: metadata?.full_name || metadata?.name || session.user.email?.split('@')[0] || 'User',
            email: session.user.email || '',
          });
        } else {
          setUser(null);
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    }
  }, []);

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

  const handleLogout = async () => {
    const client = getSupabaseClient();
    if (client) {
      try {
        await client.auth.signOut();
      } catch (err) {
        console.error('Error signing out:', err);
      }
    }
    setUser(null);
    showToast('Logged out successfully.');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 font-sans antialiased transition-colors">
      {/* Toast Banner */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 rounded-md bg-slate-900 px-3.5 py-2 text-xs font-medium text-white shadow-md dark:bg-slate-800 dark:ring-1 dark:ring-slate-700">
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

      {/* Auth Modal (Login / Signup) */}
      <AuthModal
        key={`auth-${authMode}-${isAuthModalOpen}`}
        isOpen={isAuthModalOpen}
        initialMode={authMode}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />

      {/* Screen prior to location consent */}
      {!hasLocationConsent ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 font-bold text-lg mb-3">
            Z
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Welcome to Zeus
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-sm">
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
            darkMode={darkMode}
            onToggleDarkMode={handleToggleDarkMode}
            onChangeLocation={handleOpenChangeLocation}
            onOpenLogin={handleOpenLogin}
            onOpenSignup={handleOpenSignup}
            onLogout={handleLogout}
          />

          <main className="flex-1 mx-auto w-full max-w-5xl px-4 sm:px-6 pt-5 pb-8 space-y-5">
            {/* Compact Header Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                  Environmental Dashboard
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Monitoring area: <span className="font-medium text-slate-800 dark:text-slate-200">{currentLocation}</span>
                </p>
              </div>

              <button
                onClick={handleOpenChangeLocation}
                className="self-start sm:self-auto inline-flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <RefreshCw className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
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
