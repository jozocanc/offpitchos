-- ============================================================
-- 028_backfill_display_names.sql — fix profiles.display_name rows
-- that were written with the email local-part instead of the name
-- the user typed during signup.
-- ============================================================
--
-- Context: before the onboarding/actions.ts fallback-chain fix, any
-- profile created via email signup got its display_name set from
-- `user.email.split('@')[0]` because the onboarding action never read
-- `user_metadata.display_name` (where signup stores the typed name).
-- Result: dashboard rendered "Welcome back, jozo.cancar27+test12"
-- instead of "Welcome back, Jozo".
--
-- Detection: a row is "broken" iff its display_name equals the local
-- part of its auth.users.email exactly. That matches every case the
-- bug produced and nothing else — a legitimate name would never
-- coincidentally equal their email local part unless the user typed
-- it in themselves, in which case the overwrite to the same string
-- from user_metadata is a no-op.
--
-- Recovery: pull the typed name from auth.users.raw_user_meta_data
-- ->> 'display_name'. If that's null/empty we cannot recover and leave
-- the row alone — worse to invent a name than to keep a placeholder.
--
-- Idempotent: after the UPDATE, affected rows no longer match the
-- WHERE clause (display_name is now the recovered name, which differs
-- from the email local part). Safe to re-run.

UPDATE profiles p
SET display_name = u.raw_user_meta_data ->> 'display_name',
    updated_at = now()
FROM auth.users u
WHERE p.user_id = u.id
  AND p.display_name = split_part(u.email, '@', 1)
  AND (u.raw_user_meta_data ->> 'display_name') IS NOT NULL
  AND (u.raw_user_meta_data ->> 'display_name') <> '';
