-- Reversible trash for daily tasks, reward plans, and shopping lists.
-- Run after shopping-lists-schema.sql and shopping-lists-save-confirmation.sql.
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.rewards ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.shopping_lists ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE OR REPLACE FUNCTION memo_private.memo_get_shopping_lists(p_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_pin IS DISTINCT FROM '2026' THEN RAISE EXCEPTION 'PIN_INCORRECT' USING ERRCODE = '42501'; END IF;
  RETURN (
    SELECT coalesce(jsonb_agg(to_jsonb(row) ORDER BY row.created_at), '[]'::jsonb)
    FROM public.shopping_lists AS row
    WHERE row.deleted_at IS NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION memo_private.memo_delete_shopping_list(p_id uuid, p_pin text, p_expected_updated_at timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_row public.shopping_lists;
BEGIN
  IF p_pin IS DISTINCT FROM '2026' THEN RAISE EXCEPTION 'PIN_INCORRECT' USING ERRCODE = '42501'; END IF;
  SELECT * INTO current_row FROM public.shopping_lists WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR current_row.deleted_at IS NOT NULL THEN RETURN true; END IF;
  IF p_expected_updated_at IS NULL OR current_row.updated_at <> p_expected_updated_at THEN RAISE EXCEPTION 'LIST_CHANGED'; END IF;
  UPDATE public.shopping_lists
    SET deleted_at = clock_timestamp(), updated_at = clock_timestamp()
    WHERE id = p_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION memo_private.memo_get_shopping_lists_with_access(p_access_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_access_token IS NULL OR NOT EXISTS (
    SELECT 1 FROM memo_private.shopping_access
    WHERE token_hash = encode(sha256(convert_to(p_access_token,'UTF8')),'hex')
  ) THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501'; END IF;
  RETURN (
    SELECT coalesce(jsonb_agg(to_jsonb(row) ORDER BY row.created_at), '[]'::jsonb)
    FROM public.shopping_lists AS row
    WHERE row.deleted_at IS NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.memo_get_shopping_lists_with_access(p_access_token text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT memo_private.memo_get_shopping_lists_with_access(p_access_token);
$$;

CREATE OR REPLACE FUNCTION memo_private.memo_get_trash(p_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_pin IS DISTINCT FROM '2026' THEN RAISE EXCEPTION 'PIN_INCORRECT' USING ERRCODE = '42501'; END IF;
  RETURN (
    SELECT coalesce(jsonb_agg(entry ORDER BY deleted_at DESC, created_at DESC), '[]'::jsonb)
    FROM (
      SELECT jsonb_build_object(
        'kind', 'task', 'id', id, 'label', text, 'date', date::text,
        'deleted_at', deleted_at, 'created_at', created_at
      ) AS entry, deleted_at, created_at
      FROM public.tasks WHERE deleted_at IS NOT NULL
      UNION ALL
      SELECT jsonb_build_object(
        'kind', 'reward', 'id', id, 'label', reward_text, 'date', NULL,
        'deleted_at', deleted_at, 'created_at', created_at
      ) AS entry, deleted_at, created_at
      FROM public.rewards WHERE deleted_at IS NOT NULL
      UNION ALL
      SELECT jsonb_build_object(
        'kind', 'shopping', 'id', id, 'label', location, 'date', shopping_date::text,
        'deleted_at', deleted_at, 'created_at', created_at
      ) AS entry, deleted_at, created_at
      FROM public.shopping_lists WHERE deleted_at IS NOT NULL
    ) AS deleted_rows
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.memo_get_trash(p_pin text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT memo_private.memo_get_trash(p_pin);
$$;

CREATE OR REPLACE FUNCTION memo_private.memo_restore_from_trash(p_kind text, p_id uuid, p_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE restored jsonb;
BEGIN
  IF p_pin IS DISTINCT FROM '2026' THEN RAISE EXCEPTION 'PIN_INCORRECT' USING ERRCODE = '42501'; END IF;

  CASE p_kind
    WHEN 'task' THEN
      UPDATE public.tasks SET deleted_at = NULL
      WHERE id = p_id AND deleted_at IS NOT NULL
      RETURNING to_jsonb(tasks) INTO restored;
    WHEN 'reward' THEN
      UPDATE public.rewards SET deleted_at = NULL
      WHERE id = p_id AND deleted_at IS NOT NULL
      RETURNING to_jsonb(rewards) INTO restored;
    WHEN 'shopping' THEN
      UPDATE public.shopping_lists SET deleted_at = NULL, updated_at = clock_timestamp()
      WHERE id = p_id AND deleted_at IS NOT NULL
      RETURNING to_jsonb(shopping_lists) INTO restored;
    ELSE
      RAISE EXCEPTION 'INVALID_TRASH_KIND';
  END CASE;

  IF restored IS NULL THEN RAISE EXCEPTION 'TRASH_ITEM_NOT_FOUND'; END IF;
  RETURN restored;
END;
$$;

CREATE OR REPLACE FUNCTION public.memo_restore_from_trash(p_kind text, p_id uuid, p_pin text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT memo_private.memo_restore_from_trash(p_kind, p_id, p_pin);
$$;

REVOKE ALL ON FUNCTION memo_private.memo_get_trash(text), public.memo_get_trash(text),
  memo_private.memo_restore_from_trash(text,uuid,text), public.memo_restore_from_trash(text,uuid,text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION memo_private.memo_get_trash(text), public.memo_get_trash(text),
  memo_private.memo_restore_from_trash(text,uuid,text), public.memo_restore_from_trash(text,uuid,text)
  TO anon, authenticated;
