-- Forward-only change: LN Halos NNN is now a calendar-MONTH sequence (Asia/Bangkok).
-- Owner anchor: HIS LN 2628270019, 26B261012001 is October 2026 #001.
-- Preserve every HIS LN, sample/run/slot ID, original audit event and old-number mapping.
-- Production preconditions deliberately refuse to renumber issued/finalized results.

BEGIN;

CREATE TABLE IF NOT EXISTS public.nipt_monthly_sequences (
  sequence_month date PRIMARY KEY CHECK (extract(day from sequence_month) = 1),
  last_value integer NOT NULL CHECK (last_value BETWEEN 0 AND 999)
);
ALTER TABLE public.nipt_monthly_sequences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.nipt_monthly_sequences FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.nipt_ln_halos_reassignments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sample_id uuid NOT NULL REFERENCES public.nipt_samples(id),
  his_ln text NOT NULL,
  old_ln_halos text NOT NULL,
  new_ln_halos text NOT NULL,
  reason text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sample_id, old_ln_halos)
);
ALTER TABLE public.nipt_ln_halos_reassignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.nipt_ln_halos_reassignments FROM PUBLIC, anon, authenticated;

-- Serialize with legacy register_nipt_sample (INSERT nipt_samples and daily counter).
LOCK TABLE public.nipt_samples IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.nipt_daily_sequences IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.nipt_sample_runs IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.nipt_result_revisions IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.nipt_task_sheets IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.nipt_storage_slots IN SHARE ROW EXCLUSIVE MODE;

DO $migration$
DECLARE
  anchor public.nipt_samples%ROWTYPE;
  v_affected integer;
BEGIN
  SELECT * INTO anchor FROM public.nipt_samples WHERE ln = '2628270019';
  IF anchor.id IS NULL OR anchor.ln_halos <> '26B261012001'
      OR (anchor.imported_at AT TIME ZONE 'Asia/Bangkok')::date <> DATE '2026-10-12' THEN
    RAISE EXCEPTION 'MONTHLY_LN_HALOS_ANCHOR_MISMATCH';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.nipt_samples
    WHERE imported_at >= TIMESTAMPTZ '2026-10-01 00:00:00+07'
      AND imported_at < anchor.imported_at
  ) THEN RAISE EXCEPTION 'MONTHLY_LN_HALOS_ANCHOR_NOT_FIRST'; END IF;

  CREATE TEMP TABLE monthly_ln_halos_oct2026_map ON COMMIT DROP AS
  SELECT id, ln AS his_ln, ln_halos AS old_code,
    to_char(imported_at AT TIME ZONE 'Asia/Bangkok','YY') || 'B'
    || to_char(imported_at AT TIME ZONE 'Asia/Bangkok','YYMMDD')
    || lpad(row_number() OVER (ORDER BY imported_at, id)::text, 3, '0') AS new_code,
    row_number() OVER (ORDER BY imported_at,id) AS monthly_number
  FROM public.nipt_samples
  WHERE imported_at >= TIMESTAMPTZ '2026-10-01 00:00:00+07'
    AND imported_at < TIMESTAMPTZ '2026-11-01 00:00:00+07';

  IF (SELECT count(*) FROM monthly_ln_halos_oct2026_map WHERE his_ln='2628270019' AND monthly_number=1 AND new_code='26B261012001') <> 1
      OR (SELECT max(monthly_number) FROM monthly_ln_halos_oct2026_map) > 999
      OR EXISTS (
        SELECT 1 FROM monthly_ln_halos_oct2026_map
        WHERE old_code !~ '^26B2610[0-9]{5}$'
           OR new_code !~ '^26B2610[0-9]{5}$'
      ) THEN RAISE EXCEPTION 'MONTHLY_LN_HALOS_RENUMBER_VALIDATION_FAILED'; END IF;

  -- Do not silently invalidate previously issued clinical/result evidence.
  IF EXISTS (
    SELECT 1 FROM public.nipt_result_revisions r
    JOIN monthly_ln_halos_oct2026_map m ON m.id=r.sample_id
  ) OR EXISTS (
    SELECT 1 FROM public.nipt_storage_slots st
    JOIN monthly_ln_halos_oct2026_map m ON m.id=st.sample_id
  ) OR EXISTS (
    SELECT 1 FROM public.nipt_sample_runs sr
    JOIN monthly_ln_halos_oct2026_map m ON m.id=sr.sample_id
    WHERE sr.stage IN ('Pooling','Sequencing','Completed')
  ) OR EXISTS (
    SELECT 1 FROM public.nipt_task_sheets sh
    JOIN public.nipt_batch_slots sl ON sl.batch_id=sh.batch_id AND sl.sheet_number=sh.sheet_number
    JOIN public.nipt_sample_runs sr ON sr.id=sl.sample_run_id
    JOIN monthly_ln_halos_oct2026_map m ON m.id=sr.sample_id
    WHERE sh.finalized_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'MONTHLY_LN_HALOS_EXISTING_ISSUED_EVIDENCE_REQUIRES_RECONCILIATION'; END IF;

  -- Retain mappings and an append-only audit for every changed identifier.
  INSERT INTO public.nipt_ln_halos_reassignments(sample_id,his_ln,old_ln_halos,new_ln_halos,reason)
  SELECT id,his_ln,old_code,new_code,
    'Owner instruction 2026-10-14: October monthly sequence anchored at HIS LN 2628270019'
  FROM monthly_ln_halos_oct2026_map WHERE old_code<>new_code;
  INSERT INTO public.nipt_audit_logs(actor_id,action,entity_type,entity_id,detail)
  SELECT NULL,'sample.ln_halos.reassigned','sample',id::text,
    jsonb_build_object('his_ln',his_ln,'old_ln_halos',old_code,
      'new_ln_halos',new_code,'month','2026-10','authority','OWNER_2026_10_14')
  FROM monthly_ln_halos_oct2026_map WHERE old_code<>new_code;

  UPDATE public.nipt_samples s SET ln_halos=m.new_code
  FROM monthly_ln_halos_oct2026_map m WHERE s.id=m.id AND s.ln_halos<>m.new_code;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected <> (SELECT count(*) FROM monthly_ln_halos_oct2026_map WHERE old_code<>new_code)
      OR EXISTS (
        SELECT 1 FROM monthly_ln_halos_oct2026_map m
        JOIN public.nipt_samples s ON s.id=m.id WHERE s.ln_halos<>m.new_code
      ) THEN RAISE EXCEPTION 'MONTHLY_LN_HALOS_POST_UPDATE_MISMATCH'; END IF;

  -- Seed from allocated historical counters, including retired/deleted numbers.
  INSERT INTO public.nipt_monthly_sequences(sequence_month,last_value)
  SELECT date_trunc('month',sequence_date)::date,least(999,sum(last_value)::integer)
  FROM public.nipt_daily_sequences GROUP BY 1
  ON CONFLICT (sequence_month) DO UPDATE
  SET last_value=greatest(public.nipt_monthly_sequences.last_value,excluded.last_value);

  INSERT INTO public.nipt_monthly_sequences(sequence_month,last_value)
  SELECT DATE '2026-10-01',least(999,max(monthly_number)::integer)
  FROM monthly_ln_halos_oct2026_map
  ON CONFLICT (sequence_month) DO UPDATE
  SET last_value=greatest(public.nipt_monthly_sequences.last_value,excluded.last_value);
END
$migration$;

CREATE OR REPLACE FUNCTION public.register_nipt_sample(p_ln text, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_ln text := trim(p_ln);
  v_existing public.nipt_samples;
  v_date date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
  v_month date := date_trunc('month', (now() AT TIME ZONE 'Asia/Bangkok'))::date;
  v_sequence integer;
  v_halos text;
  v_sample public.nipt_samples;
BEGIN
  IF v_ln IS NULL OR v_ln='' THEN RAISE EXCEPTION 'LN is required'; END IF;
  -- Same-HIS-LN racing requests serialize before consuming a monthly number.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_ln, 20261014));
  SELECT * INTO v_existing FROM public.nipt_samples WHERE ln=v_ln;
  IF FOUND THEN
    RETURN jsonb_build_object('duplicate',true,'sample_id',v_existing.id,'ln_halos',v_existing.ln_halos);
  END IF;

  INSERT INTO public.nipt_monthly_sequences(sequence_month,last_value)
    VALUES(v_month,1)
  ON CONFLICT (sequence_month) DO UPDATE
    SET last_value=public.nipt_monthly_sequences.last_value+1
    WHERE public.nipt_monthly_sequences.last_value<999
  RETURNING last_value INTO v_sequence;
  IF v_sequence IS NULL OR v_sequence>999 THEN
    RAISE EXCEPTION 'Monthly LN Halos sequence exceeded 999';
  END IF;
  v_halos := to_char(v_date,'YY')||'B'||to_char(v_date,'YYMMDD')||lpad(v_sequence::text,3,'0');

  BEGIN
    INSERT INTO public.nipt_samples(ln,ln_halos,imported_by)
      VALUES(v_ln,v_halos,p_actor) RETURNING * INTO v_sample;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing FROM public.nipt_samples WHERE ln=v_ln;
    IF FOUND THEN
      RETURN jsonb_build_object('duplicate',true,'sample_id',v_existing.id,'ln_halos',v_existing.ln_halos);
    END IF;
    RAISE;
  END;

  INSERT INTO public.nipt_sample_runs(sample_id,run_type,stage,created_by)
    VALUES(v_sample.id,'Normal','Received',p_actor);
  INSERT INTO public.nipt_audit_logs(actor_id,action,entity_type,entity_id,detail)
    VALUES(p_actor,'sample.register','sample',v_sample.id::text,
      jsonb_build_object('ln',v_ln,'ln_halos',v_halos));
  RETURN jsonb_build_object('duplicate',false,'sample_id',v_sample.id,'ln_halos',v_halos);
END
$function$;

REVOKE ALL ON FUNCTION public.register_nipt_sample(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_nipt_sample(text,uuid) TO service_role;
COMMIT;
