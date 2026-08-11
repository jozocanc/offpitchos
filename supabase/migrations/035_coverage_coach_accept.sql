-- 035_coverage_coach_accept.sql
--
-- Makes coach self-accept of a coverage request actually work.
--
-- coverage_requests had exactly three policies:
--   coverage_requests_doc_all    ALL     club_id IN get_doc_club_ids()
--   coverage_requests_coach_insert INSERT
--   coverage_requests_coach_read  SELECT
--
-- acceptCoverage() (app/dashboard/coverage/actions.ts:241) is called by a
-- COACH and performs an UPDATE. No policy permitted that, so the update
-- matched zero rows, `.single()` errored, and the handler threw:
--
--     'This coverage request has already been taken or is no longer available.'
--
-- Verified against production with two throwaway coaches: the volunteering
-- coach could SELECT the request (1 row) but the UPDATE affected 0 rows and
-- status stayed 'pending'. So the feature had never worked, and the error
-- message made it read as a race rather than a permissions failure — it would
-- be reported as "coverage is always already taken", never as a bug.
--
-- Coach coverage is the product's headline differentiator (a coach drops out,
-- the system finds a replacement), and it died on the final click.
--
-- The new policy is deliberately narrow:
--   USING      only PENDING requests, only in a club where the caller is staff
--   WITH CHECK the resulting row must be 'accepted' with the CALLER as the
--              covering coach
--
-- so a coach can claim an open request for themselves and nothing else. They
-- cannot touch an already-resolved request, cannot assign somebody else, and
-- cannot set an arbitrary status. DOC behaviour is unchanged: policies are
-- permissive and OR'd, so coverage_requests_doc_all still covers
-- assignCoverage(), where the DOC assigns a different coach.
--
-- Note this also makes the existing error message truthful. After this change
-- a zero-row result really does mean the request is no longer pending.

drop policy if exists coverage_requests_coach_accept on public.coverage_requests;

create policy coverage_requests_coach_accept on public.coverage_requests
  for update
  using (
    status = 'pending'
    and club_id in (select public.get_staff_club_ids())
  )
  with check (
    status = 'accepted'
    and covering_coach_id in (select public.get_user_profile_ids())
    and club_id in (select public.get_staff_club_ids())
  );
