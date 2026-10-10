import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { StatusCards } from './components/StatusCards';
import { MapSection } from './components/MapSection';
import { SurveysSection } from './components/SurveysSection';
import { EventsSection, EventItem } from './components/EventsSection';
import { Footer } from './components/Footer';
import { LocationConsentModal } from './components/LocationConsentModal';
import { AuthModal } from './components/AuthModal';
import { UserSession, MonitoredZone, ZoneStatusItem } from './types';
import { RefreshCw, Play, CheckCircle2, ShieldAlert, Cpu } from 'lucide-react';
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
  const [currentZoneId, setCurrentZoneId] = useState<string>('zone-academic');
  const [isLocationModalOpen, setIsLocationModalOpen] = useState<boolean>(true);
  const [locationModalMode, setLocationModalMode] = useState<'consent' | 'manual'>('consent');

  // Authentication State
  const [user, setUser] = useState<UserSession | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');

  // Backend Pipeline & Database State
  const [zones, setZones] = useState<MonitoredZone[]>([]);
  const [zoneStatusList, setZoneStatusList] = useState<ZoneStatusItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [pipelineStatus, setPipelineStatus] = useState<{
    isPipelineRunning: boolean;
    lastRunAt: string | null;
    runCount: number;
    intervalMinutes: number;
  }>({
    isPipelineRunning: false,
    lastRunAt: null,
    runCount: 0,
    intervalMinutes: 60,
  });
  const [isEvaluatingPipeline, setIsEvaluatingPipeline] = useState<boolean>(false);

  // Brief toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  };

  // Load backend data (zones, zone-status, events, pipeline status)
  const loadBackendData = async () => {
    try {
      const [zonesRes, statusRes, eventsRes, pipeRes] = await Promise.all([
        fetch('/api/zones'),
        fetch('/api/zone-status'),
        fetch('/api/events'),
        fetch('/api/pipeline/status'),
      ]);

      if (zonesRes.ok) {
        const d = await zonesRes.json();
        if (d.zones) setZones(d.zones);
      }
      if (statusRes.ok) {
        const d = await statusRes.json();
        if (d.statusList) setZoneStatusList(d.statusList);
      }
      if (eventsRes.ok) {
        const d = await eventsRes.json();
        if (d.events) setEvents(d.events);
      }
      if (pipeRes.ok) {
        const d = await pipeRes.json();
        if (d.status) setPipelineStatus(d.status);
      }
    } catch (err) {
      console.warn('[Backend Sync Warning]', err);
    }
  };

  useEffect(() => {
    loadBackendData();
    // Poll every 30 seconds for live zone status & event updates
    const timer = setInterval(loadBackendData, 30000);
    return () => clearInterval(timer);
  }, []);

  // Check and listen for active Supabase Auth session
  useEffect(() => {
    const client = getSupabaseClient();
    if (client) {
      client.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          const metadata = session.user.user_metadata;
          const phone = session.user.phone || '';
          const email = session.user.email || '';
          setUser({
            id: session.user.id,
            name:
              metadata?.full_name ||
              metadata?.name ||
              (phone ? `User (${phone})` : '') ||
              email.split('@')[0] ||
              'User',
            phone,
            email,
          });
        }
      });

      const {
        data: { subscription },
      } = client.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          const metadata = session.user.user_metadata;
          const phone = session.user.phone || '';
          const email = session.user.email || '';
          setUser({
            id: session.user.id,
            name:
              metadata?.full_name ||
              metadata?.name ||
              (phone ? `User (${phone})` : '') ||
              email.split('@')[0] ||
              'User',
            phone,
            email,
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

    // Map location string to zone ID
    const locLower = selectedLoc.toLowerCase();
    if (locLower.includes('rohini')) {
      setCurrentZoneId('zone-rohini');
    } else if (locLower.includes('samaypur')) {
      setCurrentZoneId('zone-samaypur-badli');
    } else if (locLower.includes('bawana')) {
      setCurrentZoneId('zone-bawana-road');
    } else if (locLower.includes('shahbad')) {
      setCurrentZoneId('zone-shahbad-market');
    } else {
      setCurrentZoneId('zone-academic');
    }

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

  // Trigger manual pipeline run
  const handleTriggerPipeline = async () => {
    setIsEvaluatingPipeline(true);
    try {
      const res = await fetch('/api/pipeline/run', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showToast(`Pipeline evaluated ${data.evaluatedZones} zones (${data.newEventsCreated} new dangerous events).`);
        await loadBackendData();
      } else {
        showToast(data.message || 'Pipeline evaluation completed.');
      }
    } catch (err: any) {
      showToast('Error triggering evaluation cycle.');
    } finally {
      setIsEvaluatingPipeline(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 font-sans antialiased transition-colors">
      {/* Toast Banner */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 rounded-md bg-slate-900 px-3.5 py-2 text-xs font-medium text-white shadow-md dark:bg-slate-800 dark:ring-1 dark:ring-slate-700 animate-fade-in">
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
            Please select your location to view local environmental conditions and community reports.
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
            {/* Pipeline Status Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs shadow-2xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  Scheduled Monitoring Pipeline:
                </span>
                <span className="text-slate-600 dark:text-slate-400">
                  Every {pipelineStatus.intervalMinutes}m • {zones.length || 6} Monitored Zones
                </span>
                {pipelineStatus.lastRunAt && (
                  <span className="hidden md:inline text-[11px] text-slate-400">
                    (Last cycle:{' '}
                    {new Date(pipelineStatus.lastRunAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    )
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTriggerPipeline}
                  disabled={isEvaluatingPipeline}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-60"
                >
                  <Play className={`h-3 w-3 text-emerald-600 ${isEvaluatingPipeline ? 'animate-spin' : ''}`} />
                  <span>{isEvaluatingPipeline ? 'Evaluating...' : 'Run Pipeline Now'}</span>
                </button>
              </div>
            </div>

            {/* Compact Header Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                  Environmental Dashboard
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Active Area: <span className="font-medium text-slate-800 dark:text-slate-200">{currentLocation}</span>
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

            {/* Simplified Map with 3 layer toggles, zone markers, and live telemetry */}
            <MapSection
              currentLocation={currentLocation}
              zoneStatusList={zoneStatusList}
              onSelectStation={(stId) => setCurrentZoneId(stId)}
            />

            {/* Compact Website Surveys ("Report local conditions") */}
            <SurveysSection
              currentZoneId={currentZoneId}
              zones={zones.length > 0 ? zones : [
                { zone_id: 'zone-academic', name: 'DTU Academic Core & Library' },
                { zone_id: 'zone-sports-green', name: 'DTU Sports Complex & Forest' },
                { zone_id: 'zone-hostels', name: 'Student Hostels Enclave' },
                { zone_id: 'zone-shahbad-market', name: 'Shahbad Daulatpur Village' },
                { zone_id: 'zone-bawana-road', name: 'Bawana Road Transit Corridor' },
                { zone_id: 'zone-samaypur-badli', name: 'Samaypur Badli Industrial Hub' },
              ]}
              user={user}
              onOpenLogin={handleOpenLogin}
              onSurveySubmitted={() => {
                showToast('Report submitted! Syncing pipeline state...');
                loadBackendData();
              }}
            />

            {/* Immutable Incident History ("events") */}
            <EventsSection
              events={events}
              zones={zones}
            />
          </main>

          <Footer />
        </>
      )}
    </div>
  );
}
