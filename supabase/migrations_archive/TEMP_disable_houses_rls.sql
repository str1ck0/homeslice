-- TEMPORARY: Disable RLS on houses table to test if that's the issue
-- This allows us to isolate whether the problem is RLS or something else

ALTER TABLE houses DISABLE ROW LEVEL SECURITY;

-- Note: We'll re-enable this after testing!
-- To re-enable later: ALTER TABLE houses ENABLE ROW LEVEL SECURITY;
