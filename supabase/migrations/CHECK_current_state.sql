-- ============================================
-- RUN THIS IN SUPABASE SQL EDITOR TO DEBUG
-- ============================================

-- 1. Check if RLS is enabled on houses table
SELECT
    tablename,
    CASE WHEN rowsecurity THEN 'ENABLED' ELSE 'DISABLED' END as rls_status
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'houses';

-- 2. Check all policies on houses table
SELECT
    policyname,
    cmd as command_type,
    CASE
        WHEN qual IS NOT NULL THEN 'Has USING clause'
        ELSE 'No USING clause'
    END as using_clause,
    CASE
        WHEN with_check IS NOT NULL THEN 'Has WITH CHECK clause'
        ELSE 'No WITH CHECK clause'
    END as with_check_clause
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'houses'
ORDER BY cmd, policyname;

-- 3. Check if security definer functions exist
SELECT
    routine_name,
    routine_type,
    security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN ('user_is_house_member', 'user_house_ids');

-- 4. Test authentication (should return your user ID if logged in via dashboard)
SELECT
    auth.uid() as current_user_id,
    CASE
        WHEN auth.uid() IS NULL THEN 'NOT AUTHENTICATED'
        ELSE 'AUTHENTICATED'
    END as auth_status;

-- 5. Check your profile exists
SELECT
    id,
    username,
    created_at
FROM profiles
WHERE id = auth.uid();

-- 6. Try to see what houses exist (will fail if RLS blocks you)
SELECT COUNT(*) as total_houses FROM houses;

-- 7. Check if any house_members records exist
SELECT COUNT(*) as total_members FROM house_members;
