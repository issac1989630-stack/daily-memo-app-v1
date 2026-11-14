-- Shopping lists for the existing single-student memo app.
-- Content writes require the parent PIN on the server; checkbox writes only
-- change an existing item's completion status. Existing tables are untouched.
CREATE SCHEMA IF NOT EXISTS memo_private;
REVOKE ALL ON SCHEMA memo_private FROM PUBLIC;
GRANT USAGE ON SCHEMA memo_private TO anon, authenticated;

CREATE TABLE public.shopping_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location text NOT NULL CHECK (length(btrim(location)) BETWEEN 1 AND 120),
  shopping_date date NOT NULL,
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) BETWEEN 1 AND 50),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shopping_lists_date_idx ON public.shopping_lists (shopping_date);
ALTER TABLE public.shopping_lists ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shopping_lists FROM PUBLIC, anon, authenticated;
-- No public SELECT policy or table grants: lists are read only after PIN verification.

CREATE FUNCTION memo_private.memo_get_shopping_lists(p_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_pin IS DISTINCT FROM '2026' THEN RAISE EXCEPTION 'PIN_INCORRECT' USING ERRCODE = '42501'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(row) ORDER BY row.created_at), '[]'::jsonb) FROM public.shopping_lists AS row);
END;
$$;

CREATE FUNCTION memo_private.memo_save_shopping_list(
  p_id uuid, p_location text, p_date date, p_items jsonb, p_pin text,
  p_expected_updated_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_row public.shopping_lists; clean_items jsonb;
BEGIN
  IF p_pin IS DISTINCT FROM '2026' THEN RAISE EXCEPTION 'PIN_INCORRECT' USING ERRCODE = '42501'; END IF;
  IF p_date IS NULL OR p_location IS NULL OR length(btrim(p_location)) NOT BETWEEN 1 AND 120
    OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'INVALID_LIST'; END IF;
  IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'INVALID_ITEMS'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) AS entry(item)
    WHERE jsonb_typeof(item) <> 'object' OR jsonb_typeof(item->'text') IS DISTINCT FROM 'string'
      OR length(btrim(item->>'text')) NOT BETWEEN 1 AND 200
      OR coalesce(item->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR jsonb_typeof(item->'is_completed') IS DISTINCT FROM 'boolean')
    THEN RAISE EXCEPTION 'INVALID_ITEMS'; END IF;
  IF (SELECT count(DISTINCT item->>'id') FROM jsonb_array_elements(p_items) AS entry(item)) <> jsonb_array_length(p_items)
    THEN RAISE EXCEPTION 'DUPLICATE_ITEM_ID'; END IF;
  SELECT jsonb_agg(jsonb_build_object('id', item->>'id', 'text', btrim(item->>'text'),
      'is_completed', (item->>'is_completed')::boolean) ORDER BY ordinal)
    INTO clean_items FROM jsonb_array_elements(p_items) WITH ORDINALITY AS entry(item, ordinal);
  SELECT * INTO current_row FROM public.shopping_lists WHERE id = p_id FOR UPDATE;
  IF FOUND THEN
    -- A retry of a successful create must not create a second list.
    IF p_expected_updated_at IS NULL AND current_row.location = btrim(p_location)
      AND current_row.shopping_date = p_date AND current_row.items = clean_items THEN RETURN to_jsonb(current_row); END IF;
    IF p_expected_updated_at IS NULL OR current_row.updated_at <> p_expected_updated_at THEN RAISE EXCEPTION 'LIST_CHANGED'; END IF;
    UPDATE public.shopping_lists SET location = btrim(p_location), shopping_date = p_date,
      items = clean_items, updated_at = clock_timestamp() WHERE id = p_id RETURNING * INTO current_row;
  ELSE
    IF p_expected_updated_at IS NOT NULL THEN RAISE EXCEPTION 'LIST_NOT_FOUND'; END IF;
    INSERT INTO public.shopping_lists(id, location, shopping_date, items)
      VALUES (coalesce(p_id, gen_random_uuid()), btrim(p_location), p_date, clean_items) RETURNING * INTO current_row;
  END IF;
  RETURN to_jsonb(current_row);
END;
$$;

CREATE FUNCTION memo_private.memo_delete_shopping_list(p_id uuid, p_pin text, p_expected_updated_at timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_row public.shopping_lists;
BEGIN
  IF p_pin IS DISTINCT FROM '2026' THEN RAISE EXCEPTION 'PIN_INCORRECT' USING ERRCODE = '42501'; END IF;
  SELECT * INTO current_row FROM public.shopping_lists WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN true; END IF;
  IF p_expected_updated_at IS NULL OR current_row.updated_at <> p_expected_updated_at THEN RAISE EXCEPTION 'LIST_CHANGED'; END IF;
  DELETE FROM public.shopping_lists WHERE id = p_id;
  RETURN true;
END;
$$;

CREATE FUNCTION memo_private.memo_set_shopping_item(p_id uuid, p_item_id uuid, p_completed boolean, p_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_row public.shopping_lists; changed_items jsonb;
BEGIN
  IF p_pin IS DISTINCT FROM '2026' THEN RAISE EXCEPTION 'PIN_INCORRECT' USING ERRCODE = '42501'; END IF;
  IF p_completed IS NULL THEN RAISE EXCEPTION 'INVALID_COMPLETION'; END IF;
  SELECT * INTO current_row FROM public.shopping_lists WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LIST_NOT_FOUND'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(current_row.items) AS entry(item) WHERE item->>'id' = p_item_id::text)
    THEN RAISE EXCEPTION 'ITEM_NOT_FOUND'; END IF;
  SELECT jsonb_agg(CASE WHEN item->>'id' = p_item_id::text
      THEN jsonb_set(item, '{is_completed}', to_jsonb(p_completed), true) ELSE item END ORDER BY ordinal)
    INTO changed_items FROM jsonb_array_elements(current_row.items) WITH ORDINALITY AS entry(item, ordinal);
  UPDATE public.shopping_lists SET items = changed_items, updated_at = clock_timestamp()
    WHERE id = p_id RETURNING * INTO current_row;
  RETURN to_jsonb(current_row);
END;
$$;

CREATE FUNCTION public.memo_get_shopping_lists(p_pin text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT memo_private.memo_get_shopping_lists(p_pin);
$$;
CREATE FUNCTION public.memo_save_shopping_list(p_id uuid, p_location text, p_date date, p_items jsonb, p_pin text, p_expected_updated_at timestamptz)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT memo_private.memo_save_shopping_list(p_id, p_location, p_date, p_items, p_pin, p_expected_updated_at);
$$;
CREATE FUNCTION public.memo_delete_shopping_list(p_id uuid, p_pin text, p_expected_updated_at timestamptz)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT memo_private.memo_delete_shopping_list(p_id, p_pin, p_expected_updated_at);
$$;
CREATE FUNCTION public.memo_set_shopping_item(p_id uuid, p_item_id uuid, p_completed boolean, p_pin text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT memo_private.memo_set_shopping_item(p_id, p_item_id, p_completed, p_pin);
$$;

REVOKE ALL ON FUNCTION public.memo_get_shopping_lists(text), memo_private.memo_get_shopping_lists(text), memo_private.memo_save_shopping_list(uuid,text,date,jsonb,text,timestamptz),
  memo_private.memo_delete_shopping_list(uuid,text,timestamptz), memo_private.memo_set_shopping_item(uuid,uuid,boolean,text),
  public.memo_save_shopping_list(uuid,text,date,jsonb,text,timestamptz), public.memo_delete_shopping_list(uuid,text,timestamptz),
  public.memo_set_shopping_item(uuid,uuid,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.memo_get_shopping_lists(text), memo_private.memo_get_shopping_lists(text), memo_private.memo_save_shopping_list(uuid,text,date,jsonb,text,timestamptz),
  memo_private.memo_delete_shopping_list(uuid,text,timestamptz), memo_private.memo_set_shopping_item(uuid,uuid,boolean,text),
  public.memo_save_shopping_list(uuid,text,date,jsonb,text,timestamptz), public.memo_delete_shopping_list(uuid,text,timestamptz),
  public.memo_set_shopping_item(uuid,uuid,boolean,text) TO anon, authenticated;

