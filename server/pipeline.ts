import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import {
  evaluateAqiSeverity,
  evaluateTemperatureSeverity,
  evaluateFloodingSeverity,
  CENTRAL_THRESHOLDS,
  SeverityColor,
} from '../src/lib/thresholds';

// Environment variables
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://cvwykoupwkywiyhanivr.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_QgPwjohYfGmmpKrmnyTMfA_bf-VJH1r';
const GOOGLE_API_KEY = process.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyBu5VJGo-eqvo-7ONsVBMrOVXoRgENDCx4';
const ATTRIBUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Data structure models matching database schema
export interface ZoneRecord {
  zone_id: string;
  name: string;
  center_lat: number;
  center_lng: number;
}

export interface ZoneStatusRecord {
  zone_id: string;
  type: 'aqi' | 'temperature' | 'flooding';
  level: SeverityColor;
  value: number;
  updated_at: string;
}

export interface EventRecord {
  id: string;
  zone_id: string;
  type: 'aqi' | 'temperature' | 'flooding';
  level: SeverityColor;
  status: 'open' | 'closed';
  opened_at: string;
  closed_at: string | null;
  last_alert_at: string;
}

export interface SurveyRecord {
  id: string;
  user_id: string;
  zone_id: string;
  type: 'air' | 'flood';
  answers: Record<string, any>;
  created_at: string;
}

// Default Monitored Areas around DTU and North West Delhi
export const DEFAULT_ZONES: ZoneRecord[] = [
  {
    zone_id: 'zone-academic',
    name: 'DTU Academic Core & Library',
    center_lat: 28.7495,
    center_lng: 77.1172,
  },
  {
    zone_id: 'zone-sports-green',
    name: 'DTU Sports Complex & Botanical Forest',
    center_lat: 28.7525,
    center_lng: 77.1120,
  },
  {
    zone_id: 'zone-hostels',
    name: 'Student Hostels & Residential Enclave',
    center_lat: 28.7450,
    center_lng: 77.1165,
  },
  {
    zone_id: 'zone-shahbad-market',
    name: 'Shahbad Daulatpur Village & Market Chowk',
    center_lat: 28.7440,
    center_lng: 77.1235,
  },
  {
    zone_id: 'zone-bawana-road',
    name: 'Bawana Road & Gate 2 Transit Corridor',
    center_lat: 28.7540,
    center_lng: 77.1215,
  },
  {
    zone_id: 'zone-samaypur-badli',
    name: 'Samaypur Badli Industrial & Rail Hub',
    center_lat: 28.7405,
    center_lng: 77.1350,
  },
];

// Persistent state file path for fail-safe server continuity
const STATE_FILE_PATH = path.resolve(process.cwd(), 'data', 'pipeline_state.json');

interface LocalState {
  zones: ZoneRecord[];
  zoneStatus: Record<string, ZoneStatusRecord>; // key: `${zone_id}:${type}`
  events: EventRecord[];
  surveys: SurveyRecord[];
  lastRunAt: string | null;
  runCount: number;
}

function loadState(): LocalState {
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const raw = fs.readFileSync(STATE_FILE_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[Pipeline] Could not load state file, initializing fresh:', err);
  }
  return {
    zones: [...DEFAULT_ZONES],
    zoneStatus: {},
    events: [],
    surveys: [],
    lastRunAt: null,
    runCount: 0,
  };
}

function saveState(state: LocalState): void {
  try {
    const dir = path.dirname(STATE_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Pipeline] Error saving state:', err);
  }
}

let memoryState: LocalState = loadState();
let isPipelineRunning = false;

/**
 * Fetch environmental data from Google Air Quality API
 */
async function fetchAirQualityFromApi(lat: number, lng: number): Promise<{ aqi: number; isFresh: boolean }> {
  try {
    const url = `https://airquality.googleapis.com/v1/currentConditions:lookup?key=${GOOGLE_API_KEY}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Maps-Solution-ID': ATTRIBUTION_ID,
      },
      body: JSON.stringify({
        location: { latitude: lat, longitude: lng },
        extraComputations: ['LOCAL_AQI'],
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const indIndex = data.indexes?.find((i: any) => i.code === 'ind_cpcb');
      const uaqiIndex = data.indexes?.find((i: any) => i.code === 'uaqi');
      const activeIndex = indIndex || uaqiIndex || data.indexes?.[0];
      if (activeIndex && typeof activeIndex.aqi === 'number') {
        return { aqi: activeIndex.aqi, isFresh: true };
      }
    }
  } catch (err) {
    console.warn(`[Pipeline] Air quality API warning for ${lat},${lng}:`, err);
  }
  // Deterministic baseline if temporary network blip
  return { aqi: 125, isFresh: false };
}

/**
 * Fetch environmental data from Google Weather API
 */
async function fetchWeatherFromApi(lat: number, lng: number): Promise<{
  temperature: number;
  precipitationProb: number;
  rain24hMm: number;
  isFresh: boolean;
}> {
  try {
    const url = `https://weather.googleapis.com/v1/currentConditions:lookup?key=${GOOGLE_API_KEY}&location.latitude=${lat}&location.longitude=${lng}&solution_id=${ATTRIBUTION_ID}`;
    const res = await fetch(url, {
      headers: {
        'X-Goog-Maps-Solution-ID': ATTRIBUTION_ID,
      },
    });

    if (res.ok) {
      const data = await res.json();
      const temp = Math.round((data.temperature?.degrees ?? 30.5) * 10) / 10;
      const precipProb = data.precipitation?.probability?.percent ?? 10;
      const rain24h = data.currentConditionsHistory?.qpf?.quantity ?? 0.0;
      return {
        temperature: temp,
        precipitationProb: precipProb,
        rain24hMm: rain24h,
        isFresh: true,
      };
    }
  } catch (err) {
    console.warn(`[Pipeline] Weather API warning for ${lat},${lng}:`, err);
  }
  return {
    temperature: 31.0,
    precipitationProb: 15,
    rain24hMm: 0.0,
    isFresh: false,
  };
}

/**
 * Sync zones from Supabase (or populate default zones)
 */
export async function syncZones(): Promise<ZoneRecord[]> {
  try {
    const { data, error } = await supabase.from('zones').select('*');
    if (!error && data && data.length > 0) {
      memoryState.zones = data as ZoneRecord[];
      saveState(memoryState);
      return data as ZoneRecord[];
    }
  } catch (err) {
    console.warn('[Pipeline] Could not fetch zones from Supabase, using local zones.');
  }

  // If Supabase zones are empty, ensure local memory has default zones
  if (memoryState.zones.length === 0) {
    memoryState.zones = [...DEFAULT_ZONES];
    saveState(memoryState);
  }
  return memoryState.zones;
}

/**
 * Evaluate recent community surveys for a zone
 */
export function getRecentCorroboratingSurveys(zoneId: string, hoursWindow = 3): SurveyRecord[] {
  const cutoff = Date.now() - hoursWindow * 3600 * 1000;
  return memoryState.surveys.filter((s) => {
    if (s.zone_id !== zoneId) return false;
    const time = new Date(s.created_at).getTime();
    if (isNaN(time) || time < cutoff) return false;

    // Check if report indicates flooding / waterlogging
    if (s.type === 'flood') {
      const status = s.answers?.flooding || s.answers?.status || s.answers?.response;
      return status === 'Waterlogging' || status === 'Flooding' || status === 'waterlogging' || status === 'flooding';
    }
    return false;
  });
}

/**
 * Run the complete scheduled monitoring evaluation pipeline
 */
export async function runMonitoringPipeline(): Promise<{
  success: boolean;
  timestamp: string;
  evaluatedZones: number;
  newEventsCreated: number;
  message: string;
}> {
  if (isPipelineRunning) {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      evaluatedZones: 0,
      newEventsCreated: 0,
      message: 'Monitoring pipeline is already in progress.',
    };
  }

  isPipelineRunning = true;
  const now = new Date().toISOString();
  let newEventsCreated = 0;

  try {
    console.log(`[Pipeline] Starting scheduled evaluation cycle at ${now}...`);
    const zones = await syncZones();

    for (const zone of zones) {
      // 1. Fetch live readings
      const [aqiResult, weatherResult] = await Promise.all([
        fetchAirQualityFromApi(zone.center_lat, zone.center_lng),
        fetchWeatherFromApi(zone.center_lat, zone.center_lng),
      ]);

      // 2. Count recent community survey evidence for flooding
      const recentFloodSurveys = getRecentCorroboratingSurveys(zone.zone_id, CENTRAL_THRESHOLDS.flooding.surveyWindowHours);
      const surveyFloodReportsCount = recentFloodSurveys.length;

      // 3. Deterministic threshold evaluations
      const aqiSeverity = evaluateAqiSeverity(aqiResult.aqi);
      const tempSeverity = evaluateTemperatureSeverity(weatherResult.temperature);
      const floodEval = evaluateFloodingSeverity(
        weatherResult.precipitationProb,
        weatherResult.rain24hMm,
        surveyFloodReportsCount
      );

      const metricsToEvaluate: Array<{
        type: 'aqi' | 'temperature' | 'flooding';
        level: SeverityColor;
        value: number;
      }> = [
        { type: 'aqi', level: aqiSeverity, value: aqiResult.aqi },
        { type: 'temperature', level: tempSeverity, value: weatherResult.temperature },
        { type: 'flooding', level: floodEval.level, value: floodEval.computedRiskPercent },
      ];

      for (const metric of metricsToEvaluate) {
        const key = `${zone.zone_id}:${metric.type}`;
        const previousStatus = memoryState.zoneStatus[key];

        // 4. Update zone_status (maintaining one current record per zone and metric)
        const updatedStatusRecord: ZoneStatusRecord = {
          zone_id: zone.zone_id,
          type: metric.type,
          level: metric.level,
          value: metric.value,
          updated_at: now,
        };

        memoryState.zoneStatus[key] = updatedStatusRecord;

        // Try upserting to Supabase
        try {
          await supabase.from('zone_status').upsert(
            {
              zone_id: zone.zone_id,
              type: metric.type,
              level: metric.level,
              value: metric.value,
              updated_at: now,
            },
            { onConflict: 'zone_id,type' }
          );
        } catch (dbErr) {
          // Fallback to memory state
        }

        // 5. Evaluate Dangerous Transition into events
        // Rule: Insert an event when a metric transitions from safe to a configured dangerous state.
        // A transition occurs if previous status was 'green' (or null on startup if dangerous)
        // and current status is 'red' (dangerous).
        const wasSafe = !previousStatus || previousStatus.level === 'green';
        const isNowDangerous = metric.level === 'red';

        if (wasSafe && isNowDangerous) {
          // Check for duplicate recent event to guard against overlapping runs
          const isDuplicate = memoryState.events.some(
            (e) =>
              e.zone_id === zone.zone_id &&
              e.type === metric.type &&
              e.status === 'open' &&
              new Date(now).getTime() - new Date(e.opened_at).getTime() < 30 * 60 * 1000
          );

          if (!isDuplicate) {
            const newEvent: EventRecord = {
              id: crypto.randomUUID(),
              zone_id: zone.zone_id,
              type: metric.type,
              level: 'red',
              status: 'open',
              opened_at: now,
              closed_at: null,
              last_alert_at: now,
            };

            // Existing events are immutable: append-only!
            memoryState.events.push(newEvent);
            newEventsCreated++;

            try {
              await supabase.from('events').insert({
                id: newEvent.id,
                zone_id: newEvent.zone_id,
                type: newEvent.type,
                level: newEvent.level,
                status: newEvent.status,
                opened_at: newEvent.opened_at,
                closed_at: newEvent.closed_at,
                last_alert_at: newEvent.last_alert_at,
              });
            } catch (evErr) {
              // Maintained in memoryState
            }

            console.log(`[Pipeline Alert] Dangerous condition detected in ${zone.name} for ${metric.type} (value: ${metric.value})! Created event ${newEvent.id}`);
          }
        }
      }
    }

    memoryState.lastRunAt = now;
    memoryState.runCount += 1;
    saveState(memoryState);

    console.log(`[Pipeline] Completed evaluation cycle: ${zones.length} zones checked, ${newEventsCreated} new dangerous events recorded.`);

    return {
      success: true,
      timestamp: now,
      evaluatedZones: zones.length,
      newEventsCreated,
      message: `Successfully evaluated ${zones.length} zones.`,
    };
  } catch (err: any) {
    console.error('[Pipeline] Error running pipeline:', err);
    return {
      success: false,
      timestamp: now,
      evaluatedZones: 0,
      newEventsCreated: 0,
      message: err.message || 'Unknown error occurred.',
    };
  } finally {
    isPipelineRunning = false;
  }
}

/**
 * Accessors for API routes
 */
export function getZones(): ZoneRecord[] {
  return memoryState.zones.length > 0 ? memoryState.zones : DEFAULT_ZONES;
}

export function getZoneStatus(): ZoneStatusRecord[] {
  return Object.values(memoryState.zoneStatus);
}

export function getEvents(): EventRecord[] {
  // Return immutable list, newest first
  return [...memoryState.events].reverse();
}

export function getSurveys(): SurveyRecord[] {
  return memoryState.surveys;
}

export async function addSurvey(submission: {
  userId?: string;
  zoneId: string;
  type: 'air' | 'flood';
  answers: Record<string, any>;
}): Promise<{ success: boolean; survey: SurveyRecord; error?: string }> {
  // Anti-spam / duplicate prevention (same user or ip, same zone & type within 1 minute)
  const oneMinuteAgo = Date.now() - 60 * 1000;
  const recentDuplicate = memoryState.surveys.find(
    (s) =>
      s.zone_id === submission.zoneId &&
      s.type === submission.type &&
      s.user_id === (submission.userId || 'anonymous-user') &&
      new Date(s.created_at).getTime() > oneMinuteAgo
  );

  if (recentDuplicate) {
    return {
      success: false,
      survey: recentDuplicate,
      error: 'You have submitted a report for this area recently. Please wait a minute before submitting again.',
    };
  }

  const newSurvey: SurveyRecord = {
    id: crypto.randomUUID(),
    user_id: submission.userId || '00000000-0000-0000-0000-000000000000',
    zone_id: submission.zoneId,
    type: submission.type,
    answers: submission.answers,
    created_at: new Date().toISOString(),
  };

  memoryState.surveys.push(newSurvey);
  saveState(memoryState);

  // Attempt to write to Supabase
  try {
    await supabase.from('surveys').insert({
      id: newSurvey.id,
      user_id: newSurvey.user_id,
      zone_id: newSurvey.zone_id,
      type: newSurvey.type,
      answers: newSurvey.answers,
      created_at: newSurvey.created_at,
    });
  } catch (err) {
    // Saved in memoryState
  }

  return { success: true, survey: newSurvey };
}

export function getPipelineStatus(): {
  isPipelineRunning: boolean;
  lastRunAt: string | null;
  runCount: number;
  intervalMinutes: number;
} {
  return {
    isPipelineRunning,
    lastRunAt: memoryState.lastRunAt,
    runCount: memoryState.runCount,
    intervalMinutes: CENTRAL_THRESHOLDS.monitoring.defaultIntervalMinutes,
  };
}
