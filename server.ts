import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import dotenv from 'dotenv';
import {
  runMonitoringPipeline,
  getZones,
  getZoneStatus,
  getEvents,
  getSurveys,
  addSurvey,
  getPipelineStatus,
} from './server/pipeline';
import { CENTRAL_THRESHOLDS } from './src/lib/thresholds';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json());

// API Routes
app.get('/api/zones', (_req, res) => {
  res.json({ zones: getZones() });
});

app.get('/api/zone-status', (_req, res) => {
  res.json({ statusList: getZoneStatus() });
});

app.get('/api/events', (_req, res) => {
  res.json({ events: getEvents() });
});

app.get('/api/surveys', (req, res) => {
  const { zone_id } = req.query;
  let list = getSurveys();
  if (zone_id && typeof zone_id === 'string') {
    list = list.filter((s) => s.zone_id === zone_id);
  }

  // Sanitize community surveys to protect individual privacy (RLS compliance)
  // Hide full user_id and phone numbers
  const sanitized = list.map((s) => ({
    id: s.id,
    zone_id: s.zone_id,
    type: s.type,
    created_at: s.created_at,
    summary: s.answers?.flooding || s.answers?.air_quality || s.answers?.temperature || 'Community Report',
    description: s.answers?.description ? s.answers.description.slice(0, 140) : undefined,
  }));

  res.json({ surveys: sanitized, count: sanitized.length });
});

app.post('/api/surveys', async (req, res) => {
  try {
    const { userId, zoneId, type, answers } = req.body;
    if (!zoneId || !type || !answers) {
      return res.status(400).json({ error: 'Missing required survey fields (zoneId, type, answers).' });
    }

    if (type !== 'air' && type !== 'flood') {
      return res.status(400).json({ error: 'Invalid survey type. Must be "air" or "flood".' });
    }

    const result = await addSurvey({ userId, zoneId, type, answers });
    if (!result.success) {
      return res.status(429).json({ error: result.error });
    }

    res.status(201).json({ success: true, survey: result.survey });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to submit survey.' });
  }
});

app.get('/api/thresholds', (_req, res) => {
  res.json({ thresholds: CENTRAL_THRESHOLDS });
});

app.get('/api/pipeline/status', (_req, res) => {
  res.json({ status: getPipelineStatus() });
});

app.post('/api/pipeline/run', async (_req, res) => {
  try {
    const result = await runMonitoringPipeline();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Configure and start background monitoring schedule
const intervalMinutes = process.env.MONITORING_INTERVAL_MINUTES
  ? parseInt(process.env.MONITORING_INTERVAL_MINUTES, 10)
  : CENTRAL_THRESHOLDS.monitoring.defaultIntervalMinutes; // Default: 60 minutes

console.log(`[Zeus Background Service] Scheduled monitoring loop configured every ${intervalMinutes} minutes.`);

// Run immediately on boot to ensure fresh database status
runMonitoringPipeline().catch((e) => console.error('[Pipeline Initial Run Error]', e));

// Run recurring background timer
setInterval(() => {
  console.log(`[Zeus Background Service] Running scheduled interval check...`);
  runMonitoringPipeline().catch((e) => console.error('[Pipeline Scheduled Run Error]', e));
}, intervalMinutes * 60 * 1000);

async function startServer() {
  if (!isProduction) {
    // Mount Vite middlewares in development
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EnviroWatch (Zeus) server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
