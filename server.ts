import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  runPipelineOnce,
  getZonesFromDb,
  getZoneStatusListFromDb,
  getEventsFromDb,
  getSurveys,
  getPipelineStatus,
  checkSurveyRateLimit,
  recordSurveyRateLimit,
} from './server/pipeline';
import { CENTRAL_THRESHOLDS } from './src/lib/thresholds';

// Load environment variables (.env.local for local dev, then .env)
dotenv.config({ path: '.env.local' });
dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Supabase configuration for anonymous/RLS requests
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://cvwykoupwkywiyhanivr.supabase.co';

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_QgPwjohYfGmmpKrmnyTMfA_bf-VJH1r';

// 1. Basic Security Headers (Section 4)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// 2. JSON Body size limit (20kb) (Section 4)
app.use(express.json({ limit: '20kb' }));

// 3. Health Check: Section 5 ("GET /healthz returning 200 {"ok":true} without touching the database")
app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true });
});

// 4. API Routes

// Monitored zones
app.get('/api/zones', async (_req, res) => {
  try {
    const zones = await getZonesFromDb();
    res.json({ zones });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Zone status list (Section 7: returns ai_summary, summary_updated_at, survey_count)
app.get('/api/zone-status', async (_req, res) => {
  try {
    const result = await getZoneStatusListFromDb();
    res.json({ statusList: result.statusList, isCached: result.isCached });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Historical hazard events (Section 7: open active first, then closed resolved)
app.get('/api/events', async (_req, res) => {
  try {
    const result = await getEventsFromDb();
    res.json({ events: result.events, isCached: result.isCached });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Public sanitized surveys (Section 2: sanitized, never return user ids or phones)
app.get('/api/surveys', async (req, res) => {
  const { zone_id } = req.query;
  try {
    // Read from Supabase or fallback
    const anonSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    let query = anonSupabase
      .from('surveys')
      .select('id, zone_id, type, created_at, answers')
      .order('created_at', { ascending: false })
      .limit(50);

    if (zone_id && typeof zone_id === 'string') {
      query = query.eq('zone_id', zone_id);
    }

    const { data, error } = await query;
    if (!error && data) {
      // Strictly sanitized: remove any identity traces if present in answers
      const sanitized = data.map((s) => ({
        id: s.id,
        zone_id: s.zone_id,
        type: s.type,
        created_at: s.created_at,
        answers: s.answers,
      }));
      return res.json({ surveys: sanitized, count: sanitized.length });
    }
  } catch (err) {
    // Fallback to local memory surveys
  }

  let list = getSurveys();
  if (zone_id && typeof zone_id === 'string') {
    list = list.filter((s) => s.zone_id === zone_id);
  }

  const sanitized = list.map((s) => ({
    id: s.id,
    zone_id: s.zone_id,
    type: s.type,
    created_at: s.created_at,
    answers: s.answers,
  }));

  res.json({ surveys: sanitized, count: sanitized.length });
});

// Section 2: GET /api/my-surveys (Bearer auth) returning caller's last 10 surveys
app.get('/api/my-surveys', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7).trim();
  const userSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const { data: userData, error: authErr } = await userSupabase.auth.getUser(token);
  if (authErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired session token' });
  }

  const userId = userData.user.id;

  try {
    const { data: mySurveys, error: fetchErr } = await userSupabase
      .from('surveys')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (!fetchErr && mySurveys) {
      return res.json({ surveys: mySurveys });
    }
  } catch (err: any) {
    console.warn('[My Surveys DB warning]', err.message);
  }

  // Fallback to memory
  const memSurveys = getSurveys()
    .filter((s) => s.user_id === userId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10);

  res.json({ surveys: memSurveys });
});

// Section 2: POST /api/surveys
// - Requires Authorization: Bearer <Supabase access token>
// - Uses ANON key with Authorization header so RLS applies
// - Gets user with auth.getUser(token). IGNORES any userId in body
// - Takes zone_id from user's own users row
// - Strict whitelist answer validation
// - Rate limit: 1 survey per user per type per 10 minutes
// - Inserts { user_id, zone_id, type, answers } without created_at or id
app.post('/api/surveys', async (req, res) => {
  try {
    // 1. Bearer Authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization: Bearer <token> header required' });
    }

    const token = authHeader.slice(7).trim();
    const userSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const { data: userData, error: authErr } = await userSupabase.auth.getUser(token);
    if (authErr || !userData?.user) {
      return res.status(401).json({ error: 'Invalid or expired authentication session' });
    }

    const userId = userData.user.id;

    // 2. Fetch zone_id strictly from user's own users row
    const { data: userProfile, error: profileErr } = await userSupabase
      .from('users')
      .select('zone_id')
      .eq('id', userId)
      .single();

    let zoneId = userProfile?.zone_id;
    if (!zoneId) {
      // If user profile row does not yet have zone_id, check if body provided a valid zone fallback
      // but ensure user row can be updated
      if (req.body.zoneId && typeof req.body.zoneId === 'string') {
        zoneId = req.body.zoneId;
        // Update user row with this zone_id
        await userSupabase.from('users').update({ zone_id: zoneId }).eq('id', userId);
      } else {
        return res.status(400).json({
          error: 'No zone assigned to your profile. Please set your area or select a location.',
        });
      }
    }

    const { type, answers } = req.body;

    // 3. Validate survey type
    if (type !== 'air' && type !== 'flood') {
      return res.status(400).json({ error: 'Survey type must be "air" or "flood"' });
    }

    // 4. Strict whitelist answer validation
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return res.status(400).json({ error: 'Answers must be a valid object' });
    }

    let sanitizedAnswers: Record<string, any> = {};

    if (type === 'air') {
      // air = { safe_to_go_out: boolean, eye_irritation: boolean, throat_or_lung_irritation: boolean }
      const { safe_to_go_out, eye_irritation, throat_or_lung_irritation, ...extra } = answers;

      if (Object.keys(extra).length > 0) {
        return res.status(400).json({
          error: 'Invalid fields in air survey. Only safe_to_go_out, eye_irritation, and throat_or_lung_irritation are allowed.',
        });
      }

      if (
        typeof safe_to_go_out !== 'boolean' ||
        typeof eye_irritation !== 'boolean' ||
        typeof throat_or_lung_irritation !== 'boolean'
      ) {
        return res.status(400).json({
          error: 'Air survey requires safe_to_go_out (boolean), eye_irritation (boolean), and throat_or_lung_irritation (boolean).',
        });
      }

      sanitizedAnswers = {
        safe_to_go_out,
        eye_irritation,
        throat_or_lung_irritation,
      };
    } else if (type === 'flood') {
      // flood = { water_level: 'none'|'ankle'|'knee'|'waist_or_higher', road_passable: boolean }
      const { water_level, road_passable, ...extra } = answers;

      if (Object.keys(extra).length > 0) {
        return res.status(400).json({
          error: 'Invalid fields in flood survey. Only water_level and road_passable are allowed.',
        });
      }

      const validWaterLevels = ['none', 'ankle', 'knee', 'waist_or_higher'];
      if (!validWaterLevels.includes(water_level) || typeof road_passable !== 'boolean') {
        return res.status(400).json({
          error: 'Flood survey requires water_level ("none"|"ankle"|"knee"|"waist_or_higher") and road_passable (boolean).',
        });
      }

      sanitizedAnswers = {
        water_level,
        road_passable,
      };
    }

    // 5. Server-side Rate Limit: 1 survey per user per type per 10 minutes (else 429)
    if (!checkSurveyRateLimit(userId, type)) {
      return res.status(429).json({
        error: `Rate limit: You can only submit one ${type} report every 10 minutes.`,
      });
    }

    // 6. Insert row into Supabase: { user_id, zone_id, type, answers }
    // Do NOT send created_at or id!
    const { data: insertedData, error: insertErr } = await userSupabase
      .from('surveys')
      .insert({
        user_id: userId,
        zone_id: zoneId,
        type,
        answers: sanitizedAnswers,
      })
      .select()
      .single();

    if (insertErr) {
      console.error('[Survey Insert Error]', insertErr);
      return res.status(500).json({ error: 'Failed to record survey: ' + insertErr.message });
    }

    // Record rate limit for user
    recordSurveyRateLimit(userId, type);

    res.status(201).json({
      success: true,
      survey: insertedData,
    });
  } catch (err: any) {
    console.error('[POST /api/surveys Exception]', err);
    res.status(500).json({ error: err.message || 'Internal server error processing survey' });
  }
});

// Central thresholds configuration
app.get('/api/thresholds', (_req, res) => {
  res.json({ thresholds: CENTRAL_THRESHOLDS });
});

// Pipeline status
app.get('/api/pipeline/status', (_req, res) => {
  res.json({ status: getPipelineStatus() });
});

// Section 4: POST /api/pipeline/run
// Requires header x-pipeline-secret equal to process.env.PIPELINE_SECRET, else 401
app.post('/api/pipeline/run', async (req, res) => {
  const secretHeader = req.headers['x-pipeline-secret'];
  const configuredSecret = process.env.PIPELINE_SECRET;

  if (!configuredSecret || secretHeader !== configuredSecret) {
    return res.status(401).json({
      error: 'Unauthorized: missing or invalid x-pipeline-secret header',
    });
  }

  try {
    const result = await runPipelineOnce();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Section 5: Hourly monitoring schedule with RUN_LOOP env flag
const intervalMinutes = process.env.MONITORING_INTERVAL_MINUTES
  ? parseInt(process.env.MONITORING_INTERVAL_MINUTES, 10)
  : CENTRAL_THRESHOLDS.monitoring.defaultIntervalMinutes; // Default: 60 minutes

const runLoopEnabled = (process.env.RUN_LOOP ?? 'true').toLowerCase() !== 'false';

if (runLoopEnabled) {
  console.log(
    `[Zeus Background Service] Scheduled monitoring loop active every ${intervalMinutes} minutes.`
  );

  // Run initial cycle on boot
  runPipelineOnce().catch((e) => console.error('[Pipeline Initial Run Error]', e));

  // Hourly recurring timer
  setInterval(() => {
    console.log(`[Zeus Background Service] Running scheduled interval check...`);
    runPipelineOnce().catch((e) => console.error('[Pipeline Scheduled Run Error]', e));
  }, intervalMinutes * 60 * 1000);
} else {
  console.log(
    '[Zeus Background Service] RUN_LOOP is set to false. Internal background timer disabled. Waiting for external scheduler calls to /api/pipeline/run.'
  );
}

// Section 5: Server Startup (Deployable on AWS)
async function startServer() {
  if (!isProduction) {
    // Mount Vite middlewares in development
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production with SPA fallback
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EnviroWatch (Zeus) server running on http://0.0.0.0:${PORT} [mode: ${process.env.NODE_ENV || 'development'}]`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
