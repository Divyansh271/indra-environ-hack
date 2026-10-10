import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  evaluateAqiSeverity,
  evaluateTemperatureSeverity,
  evaluateFloodingSeverity,
  CENTRAL_THRESHOLDS,
  SeverityColor,
} from '../src/lib/thresholds';
import { notifyResidents } from '../src/server/notify';

// Environment variables configuration (server-only secrets never leaked to client)
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://cvwykoupwkywiyhanivr.supabase.co';

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_QgPwjohYfGmmpKrmnyTMfA_bf-VJH1r';

// Server-only Google API Key for environmental APIs
const GOOGLE_API_KEY =
  process.env.GOOGLE_API_KEY ||
  process.env.VITE_GOOGLE_MAPS_API_KEY ||
  'AIzaSyBu5VJGo-eqvo-7ONsVBMrOVXoRgENDCx4';

const ATTRIBUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// Data models matching the database schema
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
  ai_summary?: string | null;
  summary_updated_at?: string | null;
  survey_count?: number;
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
  green_checks?: number;
}

export interface SurveyRecord {
  id: string;
  user_id: string;
  zone_id: string;
  type: 'air' | 'flood';
  answers: Record<string, any>;
  created_at: string;
}

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

// Persistent state file path for backup read fallback
const STATE_FILE_PATH = path.resolve(process.cwd(), 'data', 'pipeline_state.json');

interface LocalState {
  zones: ZoneRecord[];
  zoneStatus: Record<string, ZoneStatusRecord>; // key: `${zone_id}:${type}`
  events: EventRecord[];
  surveys: SurveyRecord[];
  lastRunAt: string | null;
  runCount: number;
  lastDbError: string | null;
  isUsingCachedData: boolean;
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
    lastDbError: null,
    isUsingCachedData: false,
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
    console.error('[Pipeline] Error saving local state:', err);
  }
}

let memoryState: LocalState = loadState();
let isPipelineRunning = false;

/**
 * Fetch environmental data from Google Air Quality API (server-side only)
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
  return { aqi: 125, isFresh: false };
}

/**
 * Fetch environmental data from Google Weather API (server-side only)
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
 * Sync and seed zones from Supabase (or populate default zones)
 */
export async function syncZones(): Promise<ZoneRecord[]> {
  try {
    const { data, error } = await supabase.from('zones').select('*');
    if (!error && data && data.length > 0) {
      memoryState.zones = data as ZoneRecord[];
      saveState(memoryState);
      return data as ZoneRecord[];
    }

    // If table is empty, attempt to seed default zones
    if (!error && (!data || data.length === 0)) {
      await supabase.from('zones').upsert(DEFAULT_ZONES, { onConflict: 'zone_id' });
      memoryState.zones = [...DEFAULT_ZONES];
      saveState(memoryState);
      return DEFAULT_ZONES;
    }
  } catch (err: any) {
    console.warn('[Pipeline] Could not fetch zones from Supabase, using local zones:', err.message);
    memoryState.lastDbError = err.message;
    memoryState.isUsingCachedData = true;
  }

  if (memoryState.zones.length === 0) {
    memoryState.zones = [...DEFAULT_ZONES];
    saveState(memoryState);
  }
  return memoryState.zones;
}

/**
 * Ensure initial zone_status rows exist in DB so .update() works
 * Does NOT overwrite existing ai_summary, summary_updated_at, or survey_count.
 */
async function ensureInitialZoneStatus(zones: ZoneRecord[]) {
  try {
    const { data, error } = await supabase.from('zone_status').select('zone_id, type');
    if (error) {
      console.warn('[Pipeline] Warning checking zone_status rows:', error.message);
      return;
    }

    const existingKeys = new Set((data || []).map((r) => `${r.zone_id}:${r.type}`));
    const rowsToInsert: any[] = [];
    const metrics: Array<'aqi' | 'temperature' | 'flooding'> = ['aqi', 'temperature', 'flooding'];

    for (const z of zones) {
      for (const m of metrics) {
        if (!existingKeys.has(`${z.zone_id}:${m}`)) {
          rowsToInsert.push({
            zone_id: z.zone_id,
            type: m,
            level: 'green',
            value: m === 'temperature' ? 25.0 : m === 'aqi' ? 50 : 0,
            updated_at: new Date().toISOString(),
            ai_summary: null,
            summary_updated_at: null,
            survey_count: 0,
          });
        }
      }
    }

    if (rowsToInsert.length > 0) {
      await supabase.from('zone_status').insert(rowsToInsert);
    }
  } catch (err: any) {
    console.warn('[Pipeline] Warning ensuring initial zone status:', err.message);
  }
}

/**
 * Corroborating flood surveys:
 * Must count DISTINCT users (latest survey per user) inside the 3-hour window
 * where the user's latest survey indicated flooding/waterlogging (water_level !== 'none').
 */
export async function getDistinctCorroboratingFloodUsersCount(
  zoneId: string,
  hoursWindow = 3
): Promise<number> {
  const cutoff = new Date(Date.now() - hoursWindow * 3600 * 1000).toISOString();

  // Try querying from Supabase first
  try {
    const { data, error } = await supabase
      .from('surveys')
      .select('user_id, answers, created_at')
      .eq('zone_id', zoneId)
      .eq('type', 'flood')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false });

    if (!error && data) {
      // Group by distinct user_id, taking the latest survey
      const latestByUser = new Map<string, any>();
      for (const s of data) {
        if (!latestByUser.has(s.user_id)) {
          latestByUser.set(s.user_id, s.answers);
        }
      }

      let corroboratingUsers = 0;
      for (const answers of latestByUser.values()) {
        const waterLevel = answers?.water_level;
        const legacyStatus = answers?.flooding;
        if (
          (waterLevel && waterLevel !== 'none') ||
          legacyStatus === 'Waterlogging' ||
          legacyStatus === 'Flooding'
        ) {
          corroboratingUsers++;
        }
      }
      return corroboratingUsers;
    }
  } catch (err: any) {
    console.warn('[Pipeline] Could not query surveys from DB, falling back to memory:', err.message);
  }

  // Memory fallback
  const cutoffMs = Date.now() - hoursWindow * 3600 * 1000;
  const recentSurveys = memoryState.surveys
    .filter((s) => {
      if (s.zone_id !== zoneId || s.type !== 'flood') return false;
      const t = new Date(s.created_at).getTime();
      return !isNaN(t) && t >= cutoffMs;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const latestByUser = new Map<string, any>();
  for (const s of recentSurveys) {
    if (!latestByUser.has(s.user_id)) {
      latestByUser.set(s.user_id, s.answers);
    }
  }

  let corroboratingUsers = 0;
  for (const answers of latestByUser.values()) {
    const waterLevel = answers?.water_level;
    const legacyStatus = answers?.flooding;
    if (
      (waterLevel && waterLevel !== 'none') ||
      legacyStatus === 'Waterlogging' ||
      legacyStatus === 'Flooding'
    ) {
      corroboratingUsers++;
    }
  }
  return corroboratingUsers;
}

/**
 * MAIN PIPELINE EXECUTION
 * Exported async function runPipelineOnce().
 * The timer and POST /api/pipeline/run both call it.
 * Evaluates each zone and metric, updates zone_status with ONLY value, level, updated_at,
 * and maintains the event lifecycle (open on red, keep open on red/yellow, close after 2 green checks).
 * Isolates failures per zone and metric.
 */
export async function runPipelineOnce(): Promise<{
  success: boolean;
  timestamp: string;
  evaluatedZones: number;
  newEventsCreated: number;
  eventsClosed: number;
  message: string;
}> {
  if (isPipelineRunning) {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      evaluatedZones: 0,
      newEventsCreated: 0,
      eventsClosed: 0,
      message: 'Monitoring pipeline is already in progress.',
    };
  }

  isPipelineRunning = true;
  const now = new Date().toISOString();
  let newEventsCreated = 0;
  let eventsClosed = 0;
  let hadDbError = false;

  try {
    console.log(`[Pipeline] Starting scheduled evaluation cycle at ${now}...`);
    const zones = await syncZones();
    await ensureInitialZoneStatus(zones);

    for (const zone of zones) {
      // 1. Fetch live telemetry with isolated catch
      let aqiResult = { aqi: 125, isFresh: false };
      let weatherResult = {
        temperature: 30.5,
        precipitationProb: 12,
        rain24hMm: 0.0,
        isFresh: false,
      };

      try {
        const [a, w] = await Promise.all([
          fetchAirQualityFromApi(zone.center_lat, zone.center_lng),
          fetchWeatherFromApi(zone.center_lat, zone.center_lng),
        ]);
        aqiResult = a;
        weatherResult = w;
      } catch (fetchErr: any) {
        console.warn(`[Pipeline] Telemetry fetch warning for zone ${zone.zone_id}:`, fetchErr.message);
      }

      // 2. Count DISTINCT users reporting flooding in 3-hour window
      let surveyFloodReportsCount = 0;
      try {
        surveyFloodReportsCount = await getDistinctCorroboratingFloodUsersCount(
          zone.zone_id,
          CENTRAL_THRESHOLDS.flooding.surveyWindowHours
        );
      } catch (surveyErr: any) {
        console.warn(`[Pipeline] Survey corroboration warning for zone ${zone.zone_id}:`, surveyErr.message);
      }

      // 3. Plain deterministic threshold evaluation (Decided by plain code, NEVER AI)
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

      // 4. Evaluate each metric with isolated try/catch (one failure must not stop others)
      for (const metric of metricsToEvaluate) {
        try {
          const key = `${zone.zone_id}:${metric.type}`;

          // STEP A: Update zone_status with ONLY value, level, updated_at
          // NEVER upsert whole rows! columns ai_summary, summary_updated_at, survey_count
          // belong to a database trigger and must never be overwritten or nulled here.
          const { error: updateStatusErr } = await supabase
            .from('zone_status')
            .update({
              value: metric.value,
              level: metric.level,
              updated_at: now,
            })
            .eq('zone_id', zone.zone_id)
            .eq('type', metric.type);

          if (updateStatusErr) {
            console.warn(`[Pipeline DB Warning] Could not update zone_status for ${key}:`, updateStatusErr.message);
            hadDbError = true;
            memoryState.lastDbError = updateStatusErr.message;
          }

          // Sync in-memory representation
          const prevMemory = memoryState.zoneStatus[key];
          memoryState.zoneStatus[key] = {
            zone_id: zone.zone_id,
            type: metric.type,
            level: metric.level,
            value: metric.value,
            updated_at: now,
            ai_summary: prevMemory?.ai_summary ?? null,
            summary_updated_at: prevMemory?.summary_updated_at ?? null,
            survey_count: prevMemory?.survey_count ?? 0,
          };

          // STEP B: Check for existing OPEN event for this zone and metric
          let openEvent: EventRecord | null = null;

          try {
            const { data: eventData, error: eventFetchErr } = await supabase
              .from('events')
              .select('*')
              .eq('zone_id', zone.zone_id)
              .eq('type', metric.type)
              .eq('status', 'open')
              .order('opened_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (!eventFetchErr && eventData) {
              openEvent = eventData as EventRecord;
            } else if (eventFetchErr) {
              console.warn(`[Pipeline] Event fetch warning for ${key}:`, eventFetchErr.message);
              hadDbError = true;
            }
          } catch (e: any) {
            hadDbError = true;
          }

          // Fallback to memory if DB query failed
          if (!openEvent) {
            const memOpen = memoryState.events.find(
              (e) => e.zone_id === zone.zone_id && e.type === metric.type && e.status === 'open'
            );
            if (memOpen) openEvent = memOpen;
          }

          // STEP C: LIFECYCLE EVALUATION
          if (!openEvent) {
            // No open alert exists. If level is RED, open new alert!
            if (metric.level === 'red') {
              const newEvent: EventRecord = {
                id: crypto.randomUUID(),
                zone_id: zone.zone_id,
                type: metric.type,
                level: 'red',
                status: 'open',
                opened_at: now,
                closed_at: null,
                last_alert_at: now,
                green_checks: 0,
              };

              try {
                const { error: insertErr } = await supabase.from('events').insert({
                  id: newEvent.id,
                  zone_id: newEvent.zone_id,
                  type: newEvent.type,
                  level: 'red',
                  status: 'open',
                  opened_at: newEvent.opened_at,
                  closed_at: null,
                  last_alert_at: newEvent.last_alert_at,
                  green_checks: 0,
                });

                if (insertErr) {
                  // If insert fails with unique-violation (code 23505), another run already opened it; ignore!
                  if (insertErr.code === '23505' || insertErr.message?.includes('duplicate key')) {
                    console.log(`[Pipeline] Alert already open for ${key} (code 23505).`);
                  } else {
                    console.warn(`[Pipeline] Insert event error for ${key}:`, insertErr.message);
                    hadDbError = true;
                    memoryState.lastDbError = insertErr.message;
                  }
                } else {
                  // Successful insert: notify residents stub
                  console.log(`[Pipeline Alert] Opened new RED event for ${zone.name} - ${metric.type}`);
                  newEventsCreated++;
                  memoryState.events.push(newEvent);

                  // Call notifyResidents(event) once when event is first opened
                  try {
                    await notifyResidents(newEvent);
                  } catch (notifyErr) {
                    console.error('[Pipeline Notify Warning]', notifyErr);
                  }
                }
              } catch (insErr: any) {
                console.warn(`[Pipeline] Insert event exception:`, insErr.message);
              }
            }
          } else {
            // An open event exists!
            if (metric.level === 'red' || metric.level === 'yellow') {
              // Metric is still red or yellow: keep the alert open.
              // Reset green_checks = 0 and update last_alert_at.
              try {
                const { error: keepOpenErr } = await supabase
                  .from('events')
                  .update({
                    green_checks: 0,
                    last_alert_at: now,
                  })
                  .eq('id', openEvent.id);

                if (keepOpenErr) hadDbError = true;
              } catch (e) {
                hadDbError = true;
              }

              // Update memory
              openEvent.green_checks = 0;
              openEvent.last_alert_at = now;
            } else if (metric.level === 'green') {
              // Metric is green!
              const currentChecks = (openEvent.green_checks ?? 0) + 1;

              if (currentChecks < 2) {
                // First green check: increment green_checks, keep alert open
                try {
                  const { error: incErr } = await supabase
                    .from('events')
                    .update({
                      green_checks: currentChecks,
                    })
                    .eq('id', openEvent.id);

                  if (incErr) hadDbError = true;
                } catch (e) {
                  hadDbError = true;
                }
                openEvent.green_checks = currentChecks;
              } else {
                // TWO CONSECUTIVE GREEN CHECKS: Close the alert!
                // status = 'closed', closed_at = now()
                // Alerts are closed, never deleted.
                try {
                  const { error: closeErr } = await supabase
                    .from('events')
                    .update({
                      status: 'closed',
                      closed_at: now,
                      green_checks: currentChecks,
                    })
                    .eq('id', openEvent.id);

                  if (closeErr) hadDbError = true;
                } catch (e) {
                  hadDbError = true;
                }

                openEvent.status = 'closed';
                openEvent.closed_at = now;
                openEvent.green_checks = currentChecks;
                eventsClosed++;

                // IN THE SAME FUNCTION: reset that zone_status row
                // ai_summary = null, summary_updated_at = null, survey_count = 0, level = 'green'
                try {
                  const { error: resetErr } = await supabase
                    .from('zone_status')
                    .update({
                      ai_summary: null,
                      summary_updated_at: null,
                      survey_count: 0,
                      level: 'green',
                    })
                    .eq('zone_id', zone.zone_id)
                    .eq('type', metric.type);

                  if (resetErr) hadDbError = true;
                } catch (e) {
                  hadDbError = true;
                }

                // Reset in memory as well
                if (memoryState.zoneStatus[key]) {
                  memoryState.zoneStatus[key].ai_summary = null;
                  memoryState.zoneStatus[key].summary_updated_at = null;
                  memoryState.zoneStatus[key].survey_count = 0;
                  memoryState.zoneStatus[key].level = 'green';
                }

                console.log(`[Pipeline] Closed alert ${openEvent.id} for ${zone.name} - ${metric.type} after 2 green checks. Reset zone summary.`);
              }
            }
          }
        } catch (metricErr: any) {
          console.error(`[Pipeline Error] Evaluation failure for ${zone.zone_id} metric ${metric.type}:`, metricErr.message);
        }
      }
    }

    memoryState.lastRunAt = now;
    memoryState.runCount += 1;
    memoryState.isUsingCachedData = hadDbError;
    if (!hadDbError) {
      memoryState.lastDbError = null;
    }
    saveState(memoryState);

    console.log(
      `[Pipeline] Finished cycle at ${now}. Evaluated ${zones.length} zones. New alerts: ${newEventsCreated}, Closed alerts: ${eventsClosed}.`
    );

    return {
      success: true,
      timestamp: now,
      evaluatedZones: zones.length,
      newEventsCreated,
      eventsClosed,
      message: `Evaluated ${zones.length} zones.`,
    };
  } catch (err: any) {
    console.error('[Pipeline Critical Failure]', err);
    memoryState.lastDbError = err.message;
    memoryState.isUsingCachedData = true;
    saveState(memoryState);
    return {
      success: false,
      timestamp: now,
      evaluatedZones: 0,
      newEventsCreated: 0,
      eventsClosed: 0,
      message: err.message || 'Pipeline evaluation encountered an error.',
    };
  } finally {
    isPipelineRunning = false;
  }
}

// Backward-compatibility alias
export const runMonitoringPipeline = runPipelineOnce;

/**
 * Accessors for API routes
 */
export async function getZonesFromDb(): Promise<ZoneRecord[]> {
  try {
    const { data, error } = await supabase.from('zones').select('*');
    if (!error && data && data.length > 0) {
      memoryState.zones = data as ZoneRecord[];
      memoryState.isUsingCachedData = false;
      return data as ZoneRecord[];
    }
  } catch (e: any) {
    memoryState.isUsingCachedData = true;
  }
  return memoryState.zones.length > 0 ? memoryState.zones : DEFAULT_ZONES;
}

export function getZones(): ZoneRecord[] {
  return memoryState.zones.length > 0 ? memoryState.zones : DEFAULT_ZONES;
}

export async function getZoneStatusListFromDb(): Promise<{
  statusList: ZoneStatusRecord[];
  isCached: boolean;
}> {
  try {
    const { data, error } = await supabase.from('zone_status').select('*');
    if (!error && data && data.length > 0) {
      // Update memory cache
      for (const item of data) {
        const key = `${item.zone_id}:${item.type}`;
        memoryState.zoneStatus[key] = item as ZoneStatusRecord;
      }
      memoryState.isUsingCachedData = false;
      return { statusList: data as ZoneStatusRecord[], isCached: false };
    }
    if (error) {
      memoryState.lastDbError = error.message;
      memoryState.isUsingCachedData = true;
    }
  } catch (err: any) {
    memoryState.lastDbError = err.message;
    memoryState.isUsingCachedData = true;
  }

  // Fallback to local memory cache
  return {
    statusList: Object.values(memoryState.zoneStatus),
    isCached: true,
  };
}

export function getZoneStatus(): ZoneStatusRecord[] {
  return Object.values(memoryState.zoneStatus);
}

export async function getEventsFromDb(): Promise<{
  events: EventRecord[];
  isCached: boolean;
}> {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('opened_at', { ascending: false });

    if (!error && data) {
      memoryState.events = data as EventRecord[];
      memoryState.isUsingCachedData = false;
      return { events: data as EventRecord[], isCached: false };
    }
    if (error) {
      memoryState.lastDbError = error.message;
      memoryState.isUsingCachedData = true;
    }
  } catch (err: any) {
    memoryState.lastDbError = err.message;
    memoryState.isUsingCachedData = true;
  }

  return {
    events: [...memoryState.events].reverse(),
    isCached: true,
  };
}

export function getEvents(): EventRecord[] {
  return [...memoryState.events].reverse();
}

export function getSurveys(): SurveyRecord[] {
  return memoryState.surveys;
}

/**
 * Server-side rate limit tracking for survey submissions:
 * Key: `${user_id}:${type}` -> timestamp ms
 */
const surveyRateLimits = new Map<string, number>();

export function checkSurveyRateLimit(userId: string, type: string): boolean {
  const key = `${userId}:${type}`;
  const lastTime = surveyRateLimits.get(key);
  const now = Date.now();
  if (lastTime && now - lastTime < 10 * 60 * 1000) {
    // Within 10 minutes: rate limited!
    return false;
  }
  return true;
}

export function recordSurveyRateLimit(userId: string, type: string): void {
  const key = `${userId}:${type}`;
  surveyRateLimits.set(key, Date.now());
}

export function getPipelineStatus(): {
  isPipelineRunning: boolean;
  lastRunAt: string | null;
  runCount: number;
  intervalMinutes: number;
  lastDbError: string | null;
  isUsingCachedData: boolean;
} {
  return {
    isPipelineRunning,
    lastRunAt: memoryState.lastRunAt,
    runCount: memoryState.runCount,
    intervalMinutes: CENTRAL_THRESHOLDS.monitoring.defaultIntervalMinutes,
    lastDbError: memoryState.lastDbError,
    isUsingCachedData: memoryState.isUsingCachedData,
  };
}
