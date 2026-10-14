-- Genomic-CBH operational print cursor ONLY. Not a clinical stage, attempt, or LN Halos issuer.
-- Owner lock 2026-10-15: one shared manual mark across every page/user/date.
-- Marking a new sample replaces the old mark atomically; printing never moves it.

BEGIN;

CREATE TABLE IF NOT EXISTS public.genomic_label_print_marker (
  singleton_id boolean PRIMARY KEY DEFAULT true CHECK (singleton_id = true),
  sample_id uuid REFERENCES public.nipt_samples(id) ON DELETE SET NULL,
  marked_at timestamptz,
  marked_by uuid REFERENCES public.nipt_users(id) ON DELETE SET NULL
);

INSERT INTO public.genomic_label_print_marker(singleton_id)
VALUES (true)
ON CONFLICT(singleton_id) DO NOTHING;

ALTER TABLE public.genomic_label_print_marker ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.genomic_label_print_marker FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.genomic_label_print_marker TO service_role;

CREATE OR REPLACE FUNCTION public.set_genomic_label_print_marker(p_sample uuid, p_actor uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_previous uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.nipt_users
    WHERE id = p_actor AND is_active = true AND role IN ('Admin','CBH-Staff')
  ) THEN RAISE EXCEPTION 'Active staff account required'; END IF;

  -- Lock the singleton row to serialize independent users and workstations.
  SELECT sample_id INTO v_previous
  FROM public.genomic_label_print_marker
  WHERE singleton_id = true
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Genomic print marker singleton missing'; END IF;

  IF p_sample IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.nipt_samples WHERE id = p_sample
  ) THEN RAISE EXCEPTION 'Marked sample no longer exists'; END IF;

  IF v_previous IS NOT DISTINCT FROM p_sample THEN RETURN p_sample; END IF;

  UPDATE public.genomic_label_print_marker
  SET sample_id = p_sample,
      marked_at = CASE WHEN p_sample IS NOT NULL THEN now() ELSE NULL END,
      marked_by = CASE WHEN p_sample IS NOT NULL THEN p_actor ELSE NULL END
  WHERE singleton_id = true;

  INSERT INTO public.nipt_audit_logs(actor_id,action,entity_type,entity_id,detail)
  VALUES (p_actor, 'registry.print_marker.changed', 'genomic-print-marker', 'singleton',
    jsonb_build_object('previous_sample_id', v_previous, 'next_sample_id', p_sample));

  RETURN p_sample;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_genomic_label_print_marker(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_genomic_label_print_marker(uuid, uuid) TO service_role;

COMMIT;
