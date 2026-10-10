-- ==============================================================================
-- EnviroWatch (Zeus) Schema, Enums, Constraints, and Row Level Security (RLS)
-- ==============================================================================

-- 1. Enums (already configured in project)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'zone_metric') THEN
    CREATE TYPE zone_metric AS ENUM ('aqi', 'temperature', 'flooding');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'severity') THEN
    CREATE TYPE severity AS ENUM ('green', 'yellow', 'red');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_state') THEN
    CREATE TYPE event_state AS ENUM ('open', 'closed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'survey_kind') THEN
    CREATE TYPE survey_kind AS ENUM ('air', 'flood');
  END IF;
END$$;

-- 2. Tables Schema

-- Monitored Areas (zones)
CREATE TABLE IF NOT EXISTS public.zones (
  zone_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  center_lat DOUBLE PRECISION NOT NULL,
  center_lng DOUBLE PRECISION NOT NULL
);

-- Latest Evaluated Condition (zone_status)
-- Maintains one current record per zone and metric
CREATE TABLE IF NOT EXISTS public.zone_status (
  zone_id TEXT NOT NULL REFERENCES public.zones(zone_id) ON DELETE CASCADE,
  type zone_metric NOT NULL,
  level severity NOT NULL DEFAULT 'green',
  value DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (zone_id, type)
);

-- Immutable Incident History (events)
-- Records transitions into dangerous states
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id TEXT NOT NULL REFERENCES public.zones(zone_id) ON DELETE CASCADE,
  type zone_metric NOT NULL,
  level severity NOT NULL DEFAULT 'red',
  status event_state NOT NULL DEFAULT 'open',
  opened_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  closed_at TIMESTAMPTZ,
  last_alert_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Community Website Surveys (surveys)
CREATE TABLE IF NOT EXISTS public.surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  zone_id TEXT NOT NULL REFERENCES public.zones(zone_id) ON DELETE CASCADE,
  type survey_kind NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Users / Profiles (users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  zone_id TEXT,
  name TEXT,
  phone TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Row Level Security (RLS) Configuration

ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zone_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Zones: Public read
DROP POLICY IF EXISTS "Allow public read on zones" ON public.zones;
CREATE POLICY "Allow public read on zones" ON public.zones
  FOR SELECT USING (true);

-- Zone Status: Public read
DROP POLICY IF EXISTS "Allow public read on zone_status" ON public.zone_status;
CREATE POLICY "Allow public read on zone_status" ON public.zone_status
  FOR SELECT USING (true);

-- Events: Public read (historical dangerous transitions are public information)
DROP POLICY IF EXISTS "Allow public read on events" ON public.events;
CREATE POLICY "Allow public read on events" ON public.events
  FOR SELECT USING (true);

-- Surveys: Users can only read their own private submissions
DROP POLICY IF EXISTS "Allow users to read their own surveys" ON public.surveys;
CREATE POLICY "Allow users to read their own surveys" ON public.surveys
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Surveys: Authenticated users can insert their own reports
DROP POLICY IF EXISTS "Allow authenticated users to insert surveys" ON public.surveys;
CREATE POLICY "Allow authenticated users to insert surveys" ON public.surveys
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users: Users can read and update their own profile only
DROP POLICY IF EXISTS "Allow users to manage own profile" ON public.users;
CREATE POLICY "Allow users to manage own profile" ON public.users
  FOR ALL TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 4. Seed default monitored zones around DTU
INSERT INTO public.zones (zone_id, name, center_lat, center_lng)
VALUES
  ('zone-academic', 'DTU Academic Core & Library', 28.7495, 77.1172),
  ('zone-sports-green', 'DTU Sports Complex & Botanical Forest', 28.7525, 77.1120),
  ('zone-hostels', 'Student Hostels & Residential Enclave', 28.7450, 77.1165),
  ('zone-shahbad-market', 'Shahbad Daulatpur Village & Market Chowk', 28.7440, 77.1235),
  ('zone-bawana-road', 'Bawana Road & Gate 2 Transit Corridor', 28.7540, 77.1215),
  ('zone-samaypur-badli', 'Samaypur Badli Industrial & Rail Hub', 28.7405, 77.1350)
ON CONFLICT (zone_id) DO NOTHING;
