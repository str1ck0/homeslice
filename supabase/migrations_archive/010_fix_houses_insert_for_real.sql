-- Fix houses INSERT policy - make it work with anon role too
-- The issue: Supabase client uses 'anon' role with JWT, not 'authenticated'

DROP POLICY IF EXISTS "Authenticated users can create houses" ON houses;

-- Create policy that works with both authenticated and anon roles
-- The auth.uid() check ensures only logged-in users can insert
CREATE POLICY "Authenticated users can create houses" ON houses
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- This allows any request with a valid JWT token to insert
-- auth.uid() will be NULL if not authenticated, blocking the insert
