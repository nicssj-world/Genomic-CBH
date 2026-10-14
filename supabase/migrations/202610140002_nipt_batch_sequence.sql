-- Repair the annual extraction Run counter after an administrator changes run_label.
-- Historical batch records and finalized Task Lists are never renumbered or edited.
-- Example: run_number=1 with label Run002/2026 and sequence=1 -> next Run003/2026.
-- Serialize simultaneous Create Batch requests using a transaction advisory lock.

CREATE OR REPLACE FUNCTION public.create_nipt_batch(p_actor uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_existing uuid;
  v_year integer := extract(year from now() at time zone 'Asia/Bangkok')::integer;
  v_highest integer;
  v_sequence integer;
  v_batch uuid;
BEGIN
  -- One lock per year, acquired before checking the assembling batch.
  -- Prevents parallel clients from allocating two batches at once.
  PERFORM pg_advisory_xact_lock(782604, v_year);

  SELECT id INTO v_existing
    FROM public.nipt_batches
    WHERE status = 'assembling'
    LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  -- A manually edited label may be ahead of run_number/sequence. Reserve
  -- numbers from *all three* sources, across any label's embedded year.
  SELECT greatest(
    coalesce((SELECT last_value FROM public.nipt_batch_sequences
              WHERE run_year = v_year), 0),
    coalesce((SELECT max(run_number) FROM public.nipt_batches
              WHERE run_year = v_year), 0),
    coalesce((SELECT max(
                substring(run_label FROM ('^Run([0-9]{1,4})/' || v_year::text || '$'))::integer
              ) FROM public.nipt_batches), 0)
  ) INTO v_highest;

  IF v_highest >= 9999 THEN
    RAISE EXCEPTION 'Annual NIPT batch sequence exceeded 9999';
  END IF;

  INSERT INTO public.nipt_batch_sequences(run_year, last_value)
  VALUES (v_year, v_highest + 1)
  ON CONFLICT (run_year) DO UPDATE
    SET last_value = greatest(
      public.nipt_batch_sequences.last_value + 1,
      excluded.last_value
    )
  RETURNING last_value INTO v_sequence;

  IF v_sequence > 9999 THEN
    RAISE EXCEPTION 'Annual NIPT batch sequence exceeded 9999';
  END IF;

  INSERT INTO public.nipt_batches(run_number, run_year, run_label, created_by)
    VALUES (
      v_sequence, v_year,
      'Run' || lpad(v_sequence::text, 3, '0') || '/' || v_year::text,
      p_actor
    )
    RETURNING id INTO v_batch;

  -- Preserve the existing three Task Lists / 48 plate positions / controls.
  INSERT INTO public.nipt_task_sheets(batch_id, sheet_number)
    SELECT v_batch, generate_series(1, 3);

  INSERT INTO public.nipt_batch_slots(
    batch_id, slot_number, plate_position, sheet_number, control_type
  )
    SELECT v_batch,
           slot,
           substr('ABCDEFGH', ((slot - 1) % 8) + 1, 1)
             || (((slot - 1) / 8) + 1)::text,
           CASE WHEN slot <= 16 THEN 1 WHEN slot <= 32 THEN 2 ELSE 3 END,
           CASE slot WHEN 1 THEN 'positive'
                     WHEN 25 THEN 'negative'
                     WHEN 40 THEN 'blank'
                     ELSE null END
    FROM generate_series(1, 48) slot;

  INSERT INTO public.nipt_audit_logs(actor_id, action, entity_type, entity_id)
    VALUES (p_actor, 'batch.create', 'batch', v_batch::text);

  RETURN v_batch;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_nipt_batch(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_nipt_batch(uuid) TO service_role;

-- Reconcile sequence metadata without touching any nipt_batches rows.
-- Includes renamed labels such as Run002/2026 even if run_number is 1.
WITH historical_numbers AS (
  SELECT run_year, max(run_number) AS used_number
    FROM public.nipt_batches
    GROUP BY run_year
  UNION ALL
  SELECT right(run_label, 4)::integer AS run_year,
         max(substring(run_label FROM '^Run([0-9]{1,4})/[0-9]{4}$')::integer)
    FROM public.nipt_batches
    WHERE run_label ~ '^Run[0-9]{1,4}/[0-9]{4}$'
    GROUP BY right(run_label, 4)
),
high_water AS (
  SELECT run_year, max(used_number) AS used_number
    FROM historical_numbers GROUP BY run_year
)
INSERT INTO public.nipt_batch_sequences(run_year, last_value)
SELECT run_year, used_number
  FROM high_water
  WHERE used_number BETWEEN 1 AND 9999
ON CONFLICT (run_year) DO UPDATE
  SET last_value = greatest(
    public.nipt_batch_sequences.last_value,
    excluded.last_value
  );
