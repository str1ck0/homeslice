-- Fix: House creation policy should NOT check membership (you're not a member yet!)
-- The problem: User tries to create house -> policy checks if they're a member -> they're not -> 403 Forbidden

-- Drop the old policy
DROP POLICY IF EXISTS "Authenticated users can create houses" ON houses;

-- Create a simple policy that just checks authentication and created_by
CREATE POLICY "Authenticated users can create houses" ON houses
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL AND
        auth.uid() = created_by
    );

-- Also ensure the SELECT policy works correctly
-- (This one can use the security definer function because user WILL be a member when querying)
DROP POLICY IF EXISTS "Users can view their houses" ON houses;
CREATE POLICY "Users can view their houses" ON houses
    FOR SELECT USING (
        id IN (SELECT public.user_house_ids(auth.uid()))
    );
