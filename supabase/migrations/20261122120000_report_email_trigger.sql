-- ---------------------------------------------------------------------------
-- EMAIL ASHLEY EACH NEW REPORTED COACH REPLY (his request 22 Nov 2026, "email me each new report").
--
-- After each insert into coach_reply_reports, the database posts the new row to the report-email function through
-- pg_net (asynchronous: the person's report is saved first and never waits on the email). Two Vault secrets, set
-- once per project by Ashley (the handover prompt):
--     select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');   -- may already exist
--     select vault.create_secret('<the REPORT_EMAIL_SECRET value>', 'report_email_secret');
--
-- THE REPORT ALWAYS SAVES. Until both secrets exist the trigger does nothing, and any error inside it (no Vault or no
-- pg_net on a plain Postgres, as in test:rls-local; a bad URL) is swallowed with a WARNING, never raised, so a broken
-- email can never cost a report. One mechanism: a separate "is pg_net here?" check was measured inert (the error
-- handler already covers it) and removed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.email_coach_reply_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  base text;
  secret text;
BEGIN
  BEGIN
    EXECUTE $q$ SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url' $q$ INTO base;
    EXECUTE $q$ SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'report_email_secret' $q$ INTO secret;
    IF base IS NULL OR secret IS NULL THEN
      RETURN NEW;
    END IF;
    EXECUTE $q$ SELECT net.http_post(url := $1, headers := $2, body := $3) $q$
      USING base || '/functions/v1/report-email',
            jsonb_build_object('Content-Type', 'application/json', 'x-report-email-secret', secret),
            jsonb_build_object('record', to_jsonb(NEW));
  EXCEPTION WHEN others THEN
    RAISE WARNING 'report email not sent: %', SQLERRM;
  END;
  RETURN NEW;
END
$fn$;

REVOKE ALL ON FUNCTION public.email_coach_reply_report() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS coach_reply_reports_email ON coach_reply_reports;
CREATE TRIGGER coach_reply_reports_email
  AFTER INSERT ON coach_reply_reports
  FOR EACH ROW EXECUTE FUNCTION public.email_coach_reply_report();
