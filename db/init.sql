CREATE TABLE IF NOT EXISTS substations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  pin_code TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feeders (
  id BIGSERIAL PRIMARY KEY,
  substation_id BIGINT NOT NULL REFERENCES substations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (substation_id, code)
);

CREATE TABLE IF NOT EXISTS transformers (
  id BIGSERIAL PRIMARY KEY,
  feeder_id BIGINT NOT NULL REFERENCES feeders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  pin_code TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  seq_on_line INTEGER,
  parent_pole_id BIGINT,
  topology_inferred BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (feeder_id, code)
);

CREATE TABLE IF NOT EXISTS poles (
  id BIGSERIAL PRIMARY KEY,
  transformer_id BIGINT NOT NULL REFERENCES transformers(id) ON DELETE CASCADE,
  pole_code TEXT NOT NULL,
  pin_code TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  seq_on_line INTEGER,
  parent_pole_id BIGINT REFERENCES poles(id) ON DELETE SET NULL,
  topology_inferred BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (transformer_id, pole_code)
);

ALTER TABLE transformers
  ADD CONSTRAINT transformers_parent_pole_fk
  FOREIGN KEY (parent_pole_id) REFERENCES poles(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS telemetry (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT NOT NULL,
  pole_id BIGINT NOT NULL REFERENCES poles(id) ON DELETE CASCADE,
  seq BIGINT NOT NULL,
  energized BOOLEAN NOT NULL,
  reported_at TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  UNIQUE (device_id, seq)
);

CREATE INDEX IF NOT EXISTS telemetry_pole_id_reported_at_idx
  ON telemetry (pole_id, reported_at DESC);

CREATE INDEX IF NOT EXISTS telemetry_device_seq_idx
  ON telemetry (device_id, seq DESC);

CREATE TABLE IF NOT EXISTS scheduled_outages (
  id BIGSERIAL PRIMARY KEY,
  feeder_id BIGINT REFERENCES feeders(id) ON DELETE CASCADE,
  transformer_id BIGINT REFERENCES transformers(id) ON DELETE CASCADE,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  reason TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (feeder_id IS NOT NULL OR transformer_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS scheduled_outages_active_window_idx
  ON scheduled_outages (active, start_at, end_at);

CREATE TABLE IF NOT EXISTS tickets (
  id BIGSERIAL PRIMARY KEY,
  ticket_number TEXT NOT NULL UNIQUE,
  fault_type TEXT NOT NULL,
  status TEXT NOT NULL,
  last_live_pole_id BIGINT REFERENCES poles(id) ON DELETE SET NULL,
  first_dark_pole_id BIGINT REFERENCES poles(id) ON DELETE SET NULL,
  downstream_pole_count INTEGER NOT NULL DEFAULT 0,
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
  confidence_reason TEXT NOT NULL DEFAULT '',
  pin_code TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  topology_inferred BOOLEAN NOT NULL DEFAULT FALSE,
  ai_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS tickets_status_created_at_idx
  ON tickets (status, created_at DESC);

CREATE TABLE IF NOT EXISTS ticket_events (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ticket_events_ticket_id_created_at_idx
  ON ticket_events (ticket_id, created_at DESC);

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tickets_touch_updated_at ON tickets;

CREATE TRIGGER tickets_touch_updated_at
BEFORE UPDATE ON tickets
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();
