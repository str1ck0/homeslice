-- ============================================
-- FINAL FIX: Complete RLS Policy Reset
-- Run this to completely reset all policies
-- ============================================

-- STEP 1: Drop ALL existing policies (clean slate)
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

-- STEP 2: Create security definer functions (these bypass RLS)
CREATE OR REPLACE FUNCTION public.user_is_house_member(house_id_param UUID, user_id_param UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM house_members
    WHERE house_id = house_id_param
    AND user_id = user_id_param
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.user_house_ids(user_id_param UUID)
RETURNS SETOF UUID AS $$
BEGIN
  RETURN QUERY
  SELECT house_id FROM house_members WHERE user_id = user_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- STEP 3: Create all policies from scratch
-- ============================================

-- PROFILES policies
CREATE POLICY "Users can view all profiles" ON profiles
    FOR SELECT USING (true);

CREATE POLICY "Users can insert own profile" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- HOUSES policies
-- IMPORTANT: INSERT doesn't check membership (you're not a member yet!)
CREATE POLICY "Authenticated users can create houses" ON houses
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL AND
        auth.uid() = created_by
    );

-- SELECT uses security definer function (you ARE a member when querying)
CREATE POLICY "Users can view their houses" ON houses
    FOR SELECT USING (
        id IN (SELECT public.user_house_ids(auth.uid()))
    );

CREATE POLICY "Users can update their houses" ON houses
    FOR UPDATE USING (
        id IN (SELECT public.user_house_ids(auth.uid()))
    );

-- HOUSE_MEMBERS policies
-- SELECT: Can view members if you're a member (uses security definer)
CREATE POLICY "Users can view house members" ON house_members
    FOR SELECT USING (
        public.user_is_house_member(house_id, auth.uid())
    );

-- INSERT: Can add yourself OR add others if you're already a member
CREATE POLICY "Users can add house members" ON house_members
    FOR INSERT WITH CHECK (
        user_id = auth.uid() OR
        public.user_is_house_member(house_id, auth.uid())
    );

CREATE POLICY "Users can update house members" ON house_members
    FOR UPDATE USING (
        public.user_is_house_member(house_id, auth.uid())
    );

CREATE POLICY "Users can remove house members" ON house_members
    FOR DELETE USING (
        public.user_is_house_member(house_id, auth.uid())
    );

-- EXPENSES policies
CREATE POLICY "Users can view house expenses" ON expenses
    FOR SELECT USING (
        house_id IN (SELECT public.user_house_ids(auth.uid()))
    );

CREATE POLICY "Users can create house expenses" ON expenses
    FOR INSERT WITH CHECK (
        house_id IN (SELECT public.user_house_ids(auth.uid()))
    );

CREATE POLICY "Users can update house expenses" ON expenses
    FOR UPDATE USING (
        house_id IN (SELECT public.user_house_ids(auth.uid()))
    );

CREATE POLICY "Users can delete house expenses" ON expenses
    FOR DELETE USING (
        house_id IN (SELECT public.user_house_ids(auth.uid()))
    );

-- EXPENSE_PAYMENTS policies
CREATE POLICY "Users can view expense payments" ON expense_payments
    FOR SELECT USING (
        expense_id IN (
            SELECT id FROM expenses WHERE house_id IN (
                SELECT public.user_house_ids(auth.uid())
            )
        )
    );

CREATE POLICY "Users can create expense payments" ON expense_payments
    FOR INSERT WITH CHECK (
        expense_id IN (
            SELECT id FROM expenses WHERE house_id IN (
                SELECT public.user_house_ids(auth.uid())
            )
        )
    );

CREATE POLICY "Users can update their payments" ON expense_payments
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their payments" ON expense_payments
    FOR DELETE USING (auth.uid() = user_id);

-- NOTES policies
CREATE POLICY "Users can view house notes" ON notes
    FOR SELECT USING (
        house_id IN (SELECT public.user_house_ids(auth.uid()))
    );

CREATE POLICY "Users can create house notes" ON notes
    FOR INSERT WITH CHECK (
        house_id IN (SELECT public.user_house_ids(auth.uid()))
    );

CREATE POLICY "Users can update own notes" ON notes
    FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete own notes" ON notes
    FOR DELETE USING (auth.uid() = created_by);

-- MEMBER_PRESENCE policies
CREATE POLICY "Users can view house presence" ON member_presence
    FOR SELECT USING (
        house_id IN (SELECT public.user_house_ids(auth.uid()))
    );

CREATE POLICY "Users can create presence records" ON member_presence
    FOR INSERT WITH CHECK (
        auth.uid() = user_id AND
        house_id IN (SELECT public.user_house_ids(auth.uid()))
    );

CREATE POLICY "Users can update own presence" ON member_presence
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own presence" ON member_presence
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- DONE! All policies recreated cleanly
-- ============================================
