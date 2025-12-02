-- TEMPORARY TEST: Disable RLS to see if that's the issue
-- This is NOT secure - only for testing!
-- We'll re-enable it after we figure out what's wrong

ALTER TABLE houses DISABLE ROW LEVEL SECURITY;

-- After testing, run this to re-enable:
-- ALTER TABLE houses ENABLE ROW LEVEL SECURITY;
