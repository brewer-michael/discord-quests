-- Append-only history. Events, loom evaluations and committed turns can never be
-- changed or removed, except by the privacy purge path, which runs with
-- SET LOCAL app.purge = 'on' inside its own transaction.

CREATE OR REPLACE FUNCTION dq_forbid_change() RETURNS trigger AS $$
BEGIN
  IF current_setting('app.purge', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% on %.% is not allowed: history is append-only', TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER events_append_only
  BEFORE UPDATE OR DELETE ON "events"
  FOR EACH ROW EXECUTE FUNCTION dq_forbid_change();
--> statement-breakpoint

CREATE TRIGGER evaluations_append_only
  BEFORE UPDATE OR DELETE ON "loom"."evaluations"
  FOR EACH ROW EXECUTE FUNCTION dq_forbid_change();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION dq_protect_committed_turns() RETURNS trigger AS $$
BEGIN
  IF current_setting('app.purge', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'committed' THEN
    -- The only change allowed to a committed turn is recording its Discord message id.
    IF TG_OP = 'UPDATE'
       AND NEW.status = OLD.status AND NEW.data = OLD.data AND NEW.seq = OLD.seq
       AND NEW.campaign_id = OLD.campaign_id AND NEW.stage = OLD.stage THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'committed turns are append-only';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER turns_protect_committed
  BEFORE UPDATE OR DELETE ON "turns"
  FOR EACH ROW EXECUTE FUNCTION dq_protect_committed_turns();
