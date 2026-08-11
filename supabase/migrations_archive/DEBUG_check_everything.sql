-- Run these queries one by one to debug

-- 1. Check if RLS is enabled on the houses table
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'houses';

-- 2. Check what policies exist for houses table
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'houses';

-- 3. Check if the security definer functions exist
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN ('user_is_house_member', 'user_house_ids');

-- 4. Test if you can see your own user ID (auth should work)
SELECT auth.uid();

-- 5. Check if your profile exists
SELECT id, username FROM profiles WHERE id = auth.uid();

-- 6. Try to manually insert a house (this will show the exact error)
-- Replace the user_id with your actual ID from query 4
-- INSERT INTO houses (name, address, invite_code, created_by)
-- VALUES ('Test House', '123 Test St', 'TEST01', auth.uid());
