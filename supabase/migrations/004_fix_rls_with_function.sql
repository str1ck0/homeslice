-- Fix infinite recursion by using a security definer function
-- This function bypasses RLS when checking membership

-- Drop all existing policies first
DROP POLICY IF EXISTS "Users can view their houses" ON houses;
DROP POLICY IF EXISTS "Authenticated users can create houses" ON houses;
DROP POLICY IF EXISTS "Users can view house members" ON house_members;
DROP POLICY IF EXISTS "Users can join houses" ON house_members;
DROP POLICY IF EXISTS "Users can view house expenses" ON expenses;
DROP POLICY IF EXISTS "Users can create house expenses" ON expenses;
DROP POLICY IF EXISTS "Users can view expense payments" ON expense_payments;
DROP POLICY IF EXISTS "Users can update their payments" ON expense_payments;
DROP POLICY IF EXISTS "Users can create expense payments" ON expense_payments;
DROP POLICY IF EXISTS "Users can view house notes" ON notes;
DROP POLICY IF EXISTS "Users can create house notes" ON notes;
DROP POLICY IF EXISTS "Users can update own notes" ON notes;
DROP POLICY IF EXISTS "Users can delete own notes" ON notes;
DROP POLICY IF EXISTS "Users can view house presence" ON member_presence;
DROP POLICY IF EXISTS "Users can manage own presence" ON member_presence;

-- Create a security definer function to check house membership
-- This function runs with elevated privileges and bypasses RLS
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

-- Create a function to get user's house IDs (bypasses RLS)
CREATE OR REPLACE FUNCTION public.user_house_ids(user_id_param UUID)
RETURNS SETOF UUID AS $$
BEGIN
  RETURN QUERY
  SELECT house_id FROM house_members WHERE user_id = user_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Now create policies using these functions

-- Houses policies
CREATE POLICY "Users can view their houses" ON houses
    FOR SELECT USING (
        id IN (SELECT public.user_house_ids(auth.uid()))
    );

CREATE POLICY "Authenticated users can create houses" ON houses
    FOR INSERT WITH CHECK (auth.uid() = created_by);

-- House members policies - NOW WITHOUT RECURSION!
CREATE POLICY "Users can view house members" ON house_members
    FOR SELECT USING (
        public.user_is_house_member(house_id, auth.uid())
    );

CREATE POLICY "Users can join houses" ON house_members
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Expenses policies
CREATE POLICY "Users can view house expenses" ON expenses
    FOR SELECT USING (
        house_id IN (SELECT public.user_house_ids(auth.uid()))
    );

CREATE POLICY "Users can create house expenses" ON expenses
    FOR INSERT WITH CHECK (
        house_id IN (SELECT public.user_house_ids(auth.uid()))
    );

-- Expense payments policies
CREATE POLICY "Users can view expense payments" ON expense_payments
    FOR SELECT USING (
        expense_id IN (
            SELECT id FROM expenses WHERE house_id IN (
                SELECT public.user_house_ids(auth.uid())
            )
        )
    );

CREATE POLICY "Users can update their payments" ON expense_payments
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can create expense payments" ON expense_payments
    FOR INSERT WITH CHECK (
        expense_id IN (
            SELECT id FROM expenses WHERE house_id IN (
                SELECT public.user_house_ids(auth.uid())
            )
        )
    );

-- Notes policies
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

-- Member presence policies
CREATE POLICY "Users can view house presence" ON member_presence
    FOR SELECT USING (
        house_id IN (SELECT public.user_house_ids(auth.uid()))
    );

CREATE POLICY "Users can manage own presence" ON member_presence
    FOR ALL USING (auth.uid() = user_id);
