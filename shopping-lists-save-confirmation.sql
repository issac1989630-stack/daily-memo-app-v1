-- Drafting never requires a PIN. A successful PIN-confirmed save grants this
-- browser an opaque read/checkbox capability; content writes still require PIN.
CREATE TABLE memo_private.shopping_access (
  token_hash text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE memo_private.shopping_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON memo_private.shopping_access FROM PUBLIC, anon, authenticated;

CREATE FUNCTION memo_private.memo_save_shopping_list_with_access(
  p_id uuid, p_location text, p_date date, p_items jsonb, p_pin text,
  p_expected_updated_at timestamptz, p_access_token text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE saved jsonb; access_token text;
BEGIN
  -- This call verifies the PIN before saving or issuing any capability.
  saved := memo_private.memo_save_shopping_list(p_id,p_location,p_date,p_items,p_pin,p_expected_updated_at);
  IF p_access_token IS NOT NULL AND EXISTS (SELECT 1 FROM memo_private.shopping_access
    WHERE token_hash = encode(sha256(convert_to(p_access_token,'UTF8')),'hex')) THEN
    access_token := p_access_token;
  ELSE
    access_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    INSERT INTO memo_private.shopping_access(token_hash) VALUES (encode(sha256(convert_to(access_token,'UTF8')),'hex'));
  END IF;
  RETURN jsonb_build_object('list',saved,'access_token',access_token);
END;
$$;

CREATE FUNCTION memo_private.memo_get_shopping_lists_with_access(p_access_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_access_token IS NULL OR NOT EXISTS (SELECT 1 FROM memo_private.shopping_access
    WHERE token_hash = encode(sha256(convert_to(p_access_token,'UTF8')),'hex'))
    THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(row) ORDER BY row.created_at), '[]'::jsonb) FROM public.shopping_lists AS row);
END;
$$;

CREATE FUNCTION memo_private.memo_set_shopping_item_with_access(p_id uuid, p_item_id uuid, p_completed boolean, p_access_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_row public.shopping_lists; changed_items jsonb;
BEGIN
  IF p_access_token IS NULL OR NOT EXISTS (SELECT 1 FROM memo_private.shopping_access
    WHERE token_hash = encode(sha256(convert_to(p_access_token,'UTF8')),'hex'))
    THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501'; END IF;
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

CREATE FUNCTION public.memo_save_shopping_list_with_access(
  p_id uuid, p_location text, p_date date, p_items jsonb, p_pin text, p_expected_updated_at timestamptz, p_access_token text
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT memo_private.memo_save_shopping_list_with_access(p_id,p_location,p_date,p_items,p_pin,p_expected_updated_at,p_access_token);
$$;
CREATE FUNCTION public.memo_get_shopping_lists_with_access(p_access_token text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT memo_private.memo_get_shopping_lists_with_access(p_access_token);
$$;
CREATE FUNCTION public.memo_set_shopping_item_with_access(p_id uuid, p_item_id uuid, p_completed boolean, p_access_token text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT memo_private.memo_set_shopping_item_with_access(p_id,p_item_id,p_completed,p_access_token);
$$;
REVOKE ALL ON FUNCTION memo_private.memo_save_shopping_list_with_access(uuid,text,date,jsonb,text,timestamptz,text),
  memo_private.memo_get_shopping_lists_with_access(text), memo_private.memo_set_shopping_item_with_access(uuid,uuid,boolean,text),
  public.memo_save_shopping_list_with_access(uuid,text,date,jsonb,text,timestamptz,text),
  public.memo_get_shopping_lists_with_access(text), public.memo_set_shopping_item_with_access(uuid,uuid,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION memo_private.memo_save_shopping_list_with_access(uuid,text,date,jsonb,text,timestamptz,text),
  memo_private.memo_get_shopping_lists_with_access(text), memo_private.memo_set_shopping_item_with_access(uuid,uuid,boolean,text),
  public.memo_save_shopping_list_with_access(uuid,text,date,jsonb,text,timestamptz,text),
  public.memo_get_shopping_lists_with_access(text), public.memo_set_shopping_item_with_access(uuid,uuid,boolean,text) TO anon, authenticated;
