-- ============================================
-- MASTER MIGRATION: Complete Policy Reset
-- Run this ONCE to clean everything up
-- ============================================

-- PART 1: Drop ALL existing policies on all tables
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname, tablename
        FROM pg_policies
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- PART 2: Drop and recreate security definer functions
DROP FUNCTION IF EXISTS public.user_is_house_member(UUID, UUID);
DROP FUNCTION IF EXISTS public.user_house_ids(UUID);

CREATE FUNCTION public.user_is_house_member(house_id_param UUID, user_id_param UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM house_members
    WHERE house_id = house_id_param
    AND user_id = user_id_param
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE FUNCTION public.user_house_ids(user_id_param UUID)
RETURNS SETOF UUID AS $$
BEGIN
  RETURN QUERY
  SELECT house_id FROM house_members WHERE user_id = user_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- PART 3: Create all table policies
-- ============================================

-- PROFILES
CREATE POLICY "Users can view all profiles" ON profiles
    FOR SELECT TO public USING (true);

CREATE POLICY "Users can insert own profile" ON profiles
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE TO authenticated USING (auth.uid() = id);

-- HOUSES
CREATE POLICY "Authenticated users can create houses" ON houses
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Users can view their houses" ON houses
    FOR SELECT TO authenticated USING (
        id IN (SELECT public.user_house_ids(auth.uid()))
    );

CREATE POLICY "Users can update their houses" ON houses
    FOR UPDATE TO authenticated USING (
        id IN (SELECT public.user_house_ids(auth.uid()))
    );

-- HOUSE_MEMBERS
CREATE POLICY "Users can view house members" ON house_members
    FOR SELECT TO authenticated USING (
        public.user_is_house_member(house_id, auth.uid())
    );

CREATE POLICY "Users can add house members" ON house_members
    FOR INSERT TO authenticated WITH CHECK (
        user_id = auth.uid() OR
        public.user_is_house_member(house_id, auth.uid())
    );

CREATE POLICY "Users can update house members" ON house_members
    FOR UPDATE TO authenticated USING (
        public.user_is_house_member(house_id, auth.uid())
    );

CREATE POLICY "Users can remove house members" ON house_members
    FOR DELETE TO authenticated USING (
        public.user_is_house_member(house_id, auth.uid())
    );

-- EXPENSES
CREATE POLICY "Users can view house expenses" ON expenses
    FOR SELECT TO authenticated USING (
        house_id IN (SELECT public.user_house_ids(auth.uid()))
    );

CREATE POLICY "Users can create house expenses" ON expenses
    FOR INSERT TO authenticated WITH CHECK (
        house_id IN (SELECT public.user_house_ids(auth.uid()))
    );

CREATE POLICY "Users can update house expenses" ON expenses
    FOR UPDATE TO authenticated USING (
        house_id IN (SELECT public.user_house_ids(auth.uid()))
    );

CREATE POLICY "Users can delete house expenses" ON expenses
    FOR DELETE TO authenticated USING (
        house_id IN (SELECT public.user_house_ids(auth.uid()))
    );

-- EXPENSE_PAYMENTS
CREATE POLICY "Users can view expense payments" ON expense_payments
    FOR SELECT TO authenticated USING (
        expense_id IN (
            SELECT id FROM expenses WHERE house_id IN (
                SELECT public.user_house_ids(auth.uid())
            )
        )
    );

CREATE POLICY "Users can create expense payments" ON expense_payments
    FOR INSERT TO authenticated WITH CHECK (
        expense_id IN (
            SELECT id FROM expenses WHERE house_id IN (
                SELECT public.user_house_ids(auth.uid())
            )
        )
    );

CREATE POLICY "Users can update their payments" ON expense_payments
    FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their payments" ON expense_payments
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- NOTES
CREATE POLICY "Users can view house notes" ON notes
    FOR SELECT TO authenticated USING (
        house_id IN (SELECT public.user_house_ids(auth.uid()))
    );

CREATE POLICY "Users can create house notes" ON notes
    FOR INSERT TO authenticated WITH CHECK (
        house_id IN (SELECT public.user_house_ids(auth.uid()))
    );

CREATE POLICY "Users can update own notes" ON notes
    FOR UPDATE TO authenticated USING (auth.uid() = created_by);

CREATE POLICY "Users can delete own notes" ON notes
    FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- MEMBER_PRESENCE
CREATE POLICY "Users can view house presence" ON member_presence
    FOR SELECT TO authenticated USING (
        house_id IN (SELECT public.user_house_ids(auth.uid()))
    );

CREATE POLICY "Users can create presence records" ON member_presence
    FOR INSERT TO authenticated WITH CHECK (
        auth.uid() = user_id AND
        house_id IN (SELECT public.user_house_ids(auth.uid()))
    );

CREATE POLICY "Users can update own presence" ON member_presence
    FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own presence" ON member_presence
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================
-- PART 4: Storage policies for avatars bucket
-- ============================================

-- Drop existing storage policies
DROP POLICY IF EXISTS "Users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects;

-- Allow authenticated users to upload avatars
CREATE POLICY "Users can upload avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars');

-- Allow users to update their own avatars
CREATE POLICY "Users can update own avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars');

-- Allow users to delete their own avatars
CREATE POLICY "Users can delete own avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars');

-- Allow public read access to avatars
CREATE POLICY "Avatars are publicly accessible"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- ============================================
-- PART 5: Ensure RLS is enabled on all tables
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE houses ENABLE ROW LEVEL SECURITY;
ALTER TABLE house_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_presence ENABLE ROW LEVEL SECURITY;

-- ============================================
-- DONE! All policies cleaned up and recreated
-- ============================================
