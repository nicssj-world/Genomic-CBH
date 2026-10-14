-- Genomic CBH temporary operations marker ONLY (not an NIPT CBH clinical status).
-- Migration is additive: base LN Halos, run types/stages and PET semantics stay unchanged.
BEGIN;

CREATE TABLE public.nipt_intake_day_end_markers (
  intake_date date PRIMARY KEY,
  sample_id uuid NOT NULL UNIQUE REFERENCES public.nipt_samples(id) ON DELETE CASCADE,
  marked_by uuid NOT NULL REFERENCES public.nipt_users(id),
  marked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nipt_intake_day_end_markers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.nipt_intake_day_end_markers FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_nipt_intake_day_end_marker(
  p_sample uuid, p_actor uuid, p_mark boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_sample public.nipt_samples%ROWTYPE;
  v_date date;
  v_latest uuid;
  v_before uuid;
  v_deleted integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.nipt_users WHERE id = p_actor AND is_active
  ) THEN RAISE EXCEPTION 'Unauthorized operator'; END IF;

  -- A concurrent new registration cannot slip between the latest check and marker write.
  -- After this transaction, the insert trigger invalidates the marker if another LN arrives.
  LOCK TABLE public.nipt_samples IN SHARE MODE;
  SELECT * INTO v_sample FROM public.nipt_samples WHERE id = p_sample;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sample not found'; END IF;
  v_date := (v_sample.imported_at AT TIME ZONE 'Asia/Bangkok')::date;

  SELECT sample_id INTO v_before
  FROM public.nipt_intake_day_end_markers WHERE intake_date = v_date;

  IF p_mark THEN
    SELECT s.id INTO v_latest FROM public.nipt_samples s
    WHERE (s.imported_at AT TIME ZONE 'Asia/Bangkok')::date = v_date
    ORDER BY s.imported_at DESC, s.id DESC LIMIT 1;
    IF v_latest IS DISTINCT FROM p_sample THEN
      RAISE EXCEPTION 'Only the latest registered sample of that day can be marked';
    END IF;
    IF v_before IS DISTINCT FROM p_sample THEN
      INSERT INTO public.nipt_intake_day_end_markers(intake_date, sample_id, marked_by, marked_at)
      VALUES (v_date, p_sample, p_actor, now())
      ON CONFLICT (intake_date) DO UPDATE
        SET sample_id = EXCLUDED.sample_id,
            marked_by = EXCLUDED.marked_by,
            marked_at = EXCLUDED.marked_at;
      INSERT INTO public.nipt_audit_logs(actor_id, action, entity_type, entity_id, detail)
      VALUES (p_actor, 'sample.intake_day_end.mark', 'sample', p_sample::text,
        jsonb_build_object('intake_date',v_date,'previous_sample_id',v_before));
    END IF;
  ELSE
    DELETE FROM public.nipt_intake_day_end_markers
    WHERE intake_date = v_date AND sample_id = p_sample;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted > 0 THEN
      INSERT INTO public.nipt_audit_logs(actor_id, action, entity_type, entity_id, detail)
      VALUES (p_actor, 'sample.intake_day_end.unmark', 'sample', p_sample::text,
        jsonb_build_object('intake_date',v_date));
    END IF;
  END IF;

  RETURN jsonb_build_object('sample_id',p_sample,'intake_date',v_date,'marked',p_mark);
END;
$function$;

-- When a newer LN is registered, the old day's 'last' marker ceases to be true.
CREATE OR REPLACE FUNCTION public.invalidate_nipt_intake_day_end_on_new_sample()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_invalidated uuid;
BEGIN
  DELETE FROM public.nipt_intake_day_end_markers m
  USING public.nipt_samples old_sample
  WHERE m.sample_id = old_sample.id
    AND m.intake_date = (NEW.imported_at AT TIME ZONE 'Asia/Bangkok')::date
    AND (old_sample.imported_at, old_sample.id) < (NEW.imported_at, NEW.id)
  RETURNING m.sample_id INTO v_invalidated;

  IF v_invalidated IS NOT NULL THEN
    INSERT INTO public.nipt_audit_logs(actor_id, action, entity_type, entity_id, detail)
    VALUES (NEW.imported_by, 'sample.intake_day_end.invalidated', 'sample',
      v_invalidated::text,
      jsonb_build_object('new_sample_id',NEW.id,'reason','later_same_day_intake'));
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER nipt_intake_day_end_auto_invalidate
AFTER INSERT ON public.nipt_samples
FOR EACH ROW EXECUTE FUNCTION public.invalidate_nipt_intake_day_end_on_new_sample();

REVOKE ALL ON FUNCTION public.set_nipt_intake_day_end_marker(uuid,uuid,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_nipt_intake_day_end_marker(uuid,uuid,boolean)
  TO service_role;
COMMIT;
