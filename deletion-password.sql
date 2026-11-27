-- Run after trash-schema.sql. Keep existing reversible trash and restore APIs.
-- Normal task/reward edits remain available; deletion requires a server PIN check.
CREATE OR REPLACE FUNCTION memo_private.memo_move_to_trash(p_kind text, p_id uuid, p_pin text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_pin IS DISTINCT FROM '2026' THEN
    RAISE EXCEPTION 'PIN_INCORRECT' USING ERRCODE = '42501';
  END IF;
  CASE p_kind
    WHEN 'task' THEN
      UPDATE public.tasks SET deleted_at = clock_timestamp()
      WHERE id = p_id AND deleted_at IS NULL;
    WHEN 'reward' THEN
      UPDATE public.rewards SET deleted_at = clock_timestamp()
      WHERE id = p_id AND deleted_at IS NULL;
    ELSE RAISE EXCEPTION 'INVALID_TRASH_KIND';
  END CASE;
  RETURN true;
END;
$$;
CREATE OR REPLACE FUNCTION public.memo_move_to_trash(p_kind text, p_id uuid, p_pin text)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT memo_private.memo_move_to_trash(p_kind, p_id, p_pin);
$$;
REVOKE ALL ON FUNCTION memo_private.memo_move_to_trash(text,uuid,text),
  public.memo_move_to_trash(text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION memo_private.memo_move_to_trash(text,uuid,text),
  public.memo_move_to_trash(text,uuid,text) TO anon, authenticated;

-- SECURITY INVOKER deliberately distinguishes direct Data API writes from
-- the PIN-checked private function and the existing PIN-checked restore API.
CREATE OR REPLACE FUNCTION memo_private.guard_memo_deletion()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'PARENT_CONFIRMATION_REQUIRED' USING ERRCODE = '42501';
    END IF;
    IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
      RAISE EXCEPTION 'PARENT_CONFIRMATION_REQUIRED' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION memo_private.guard_memo_deletion() FROM PUBLIC;
DROP TRIGGER IF EXISTS guard_memo_deletion ON public.tasks;
CREATE TRIGGER guard_memo_deletion BEFORE UPDATE OR DELETE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION memo_private.guard_memo_deletion();
DROP TRIGGER IF EXISTS guard_memo_deletion ON public.rewards;
CREATE TRIGGER guard_memo_deletion BEFORE UPDATE OR DELETE ON public.rewards
FOR EACH ROW EXECUTE FUNCTION memo_private.guard_memo_deletion();
