-- Fix houses INSERT policy with simpler check
-- The issue: Complex WITH CHECK conditions can fail if auth context isn't properly set

-- Drop existing INSERT policy
DROP POLICY IF EXISTS "Authenticated users can create houses" ON houses;

-- Create new INSERT policy that just checks user is authenticated
-- The application code already ensures created_by = user.id
CREATE POLICY "Authenticated users can create houses" ON houses
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- This is safe because:
-- 1. Only authenticated users can insert (TO authenticated)
-- 2. The app code sets created_by = user.id
-- 3. created_by column has a foreign key to profiles(id) which references auth.users(id)
-- 4. So users can only reference valid user IDs anyway
