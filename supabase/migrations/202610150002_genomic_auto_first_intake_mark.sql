-- Owner lock 2026-10-15: Auto Mark only the FIRST new intake of a Bangkok day.
-- A manual selection always wins, even on subsequent days, until cleared manually.
-- One shared singleton; Auto/Manual never changes LN Halos, specimen run, stage or labels.
-- No retrofit of prior-day or earlier-today samples; first registered AFTER installation
-- is marked only if it is truly that day's first sample.

BEGIN;

ALTER TABLE public.genomic_label_print_marker
  ADD COLUMN IF NOT EXISTS mark_source text,
  ADD COLUMN IF NOT EXISTS auto_evaluated_date date;

UPDATE public.genomic_label_print_marker
SET mark_source = 'MANUAL'
WHERE sample_id IS NOT NULL AND mark_source IS NULL;

ALTER TABLE public.genomic_label_print_marker
  DROP CONSTRAINT IF EXISTS genomic_label_print_marker_source_check;
ALTER TABLE public.genomic_label_print_marker
  ADD CONSTRAINT genomic_label_print_marker_source_check
  CHECK (mark_source IS NULL OR mark_source IN ('AUTO', 'MANUAL'));

-- Existing shared Manual RPC: clicking an AUTO-marked row promotes it to MANUAL.
-- Never allow the daily trigger to overwrite a consciously selected manual pointer.
CREATE OR REPLACE FUNCTION public.set_genomic_label_print_marker(p_sample uuid, p_actor uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_previous uuid;
  v_source text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.nipt_users
    WHERE id = p_actor AND is_active = true AND role IN ('Admin', 'CBH-Staff')
  ) THEN RAISE EXCEPTION 'Active staff account required'; END IF;

  SELECT sample_id, mark_source INTO v_previous, v_source
  FROM public.genomic_label_print_marker
  WHERE singleton_id = true
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Genomic print marker singleton missing'; END IF;

  IF p_sample IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.nipt_samples WHERE id = p_sample
  ) THEN RAISE EXCEPTION 'Marked sample no longer exists'; END IF;

  IF v_previous IS NOT DISTINCT FROM p_sample
      AND (p_sample IS NULL OR v_source = 'MANUAL') THEN
    RETURN p_sample;
  END IF;

  UPDATE public.genomic_label_print_marker
  SET sample_id = p_sample,
      marked_at = CASE WHEN p_sample IS NOT NULL THEN now() ELSE NULL END,
      marked_by = CASE WHEN p_sample IS NOT NULL THEN p_actor ELSE NULL END,
      mark_source = CASE WHEN p_sample IS NOT NULL THEN 'MANUAL' ELSE NULL END
  WHERE singleton_id = true;

  INSERT INTO public.nipt_audit_logs(actor_id, action, entity_type, entity_id, detail)
  VALUES (p_actor, 'registry.print_marker.changed', 'genomic-print-marker', 'singleton',
    jsonb_build_object('previous_sample_id', v_previous, 'next_sample_id', p_sample,
      'previous_source', v_source, 'next_source',
      CASE WHEN p_sample IS NOT NULL THEN 'MANUAL' ELSE NULL END));

  RETURN p_sample;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_genomic_label_print_marker(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_genomic_label_print_marker(uuid, uuid) TO service_role;

-- Fires in the SAME transaction as register_nipt_sample's new nipt_samples insert.
-- Duplicate scans don't INSERT and thus never move the cursor.
-- The existing monthly-sequence row serializes normal registration inserts.
CREATE OR REPLACE FUNCTION public.genomic_auto_mark_first_intake()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_day date := (NEW.imported_at AT TIME ZONE 'Asia/Bangkok')::date;
  v_today date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
  v_previous uuid;
  v_source text;
  v_evaluated date;
BEGIN
  -- Backfill/historical INSERTs must never silently move the live print cursor.
  IF v_day <> v_today THEN RETURN NEW; END IF;

  -- Exclusive singleton lock: Auto and Manual writes cannot race into two marks.
  SELECT sample_id, mark_source, auto_evaluated_date
  INTO v_previous, v_source, v_evaluated
  FROM public.genomic_label_print_marker
  WHERE singleton_id = true
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Genomic print marker singleton missing'; END IF;
  IF v_evaluated IS NOT NULL AND v_evaluated >= v_day THEN RETURN NEW; END IF;

  -- Process the day at most once EVEN when Manual takes priority or the day's
  -- first sample was received before this migration was installed.
  UPDATE public.genomic_label_print_marker
  SET auto_evaluated_date = v_day
  WHERE singleton_id = true;

  IF EXISTS (
    SELECT 1 FROM public.nipt_samples AS previous
    WHERE previous.id <> NEW.id
      AND previous.imported_at >= (v_day::timestamp AT TIME ZONE 'Asia/Bangkok')
      AND previous.imported_at < ((v_day + 1)::timestamp AT TIME ZONE 'Asia/Bangkok')
  ) THEN
    RETURN NEW;
  END IF;

  -- Manual remains authoritative across days and devices.
  IF v_previous IS NOT NULL AND v_source = 'MANUAL' THEN RETURN NEW; END IF;

  UPDATE public.genomic_label_print_marker
  SET sample_id = NEW.id,
      marked_at = now(),
      marked_by = NEW.imported_by,
      mark_source = 'AUTO'
  WHERE singleton_id = true;

  INSERT INTO public.nipt_audit_logs(actor_id, action, entity_type, entity_id, detail)
  VALUES (NEW.imported_by, 'registry.print_marker.auto', 'genomic-print-marker', 'singleton',
    jsonb_build_object('previous_sample_id', v_previous, 'next_sample_id', NEW.id,
      'previous_source', v_source, 'next_source', 'AUTO', 'bangkok_intake_date', v_day));

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_genomic_auto_mark_first_intake ON public.nipt_samples;
CREATE TRIGGER trg_genomic_auto_mark_first_intake
AFTER INSERT ON public.nipt_samples
FOR EACH ROW EXECUTE FUNCTION public.genomic_auto_mark_first_intake();

REVOKE ALL ON FUNCTION public.genomic_auto_mark_first_intake()
  FROM PUBLIC, anon, authenticated;

COMMIT;
