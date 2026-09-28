CREATE TABLE IF NOT EXISTS public.chiikawa_records (
  id text PRIMARY KEY,
  kind text NOT NULL,
  body jsonb NOT NULL,
  version bigint NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS chiikawa_records_kind ON public.chiikawa_records(kind);
ALTER TABLE public.chiikawa_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chiikawa_records FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.chiikawa_records TO service_role;
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('chiikawa-private', 'chiikawa-private', false, 3145728)
ON CONFLICT (id) DO NOTHING;
