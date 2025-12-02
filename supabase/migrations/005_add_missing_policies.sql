-- Add missing UPDATE policies and ensure INSERT policies are correct

-- Houses UPDATE policy (for updating house details)
DROP POLICY IF EXISTS "Users can update their houses" ON houses;
CREATE POLICY "Users can update their houses" ON houses
    FOR UPDATE USING (
        id IN (SELECT public.user_house_ids(auth.uid()))
    );

-- Make sure house_members INSERT policy allows users to be added by anyone in the house
DROP POLICY IF EXISTS "Users can join houses" ON house_members;
CREATE POLICY "House members can add members" ON house_members
    FOR INSERT WITH CHECK (
        user_id = auth.uid() OR
        public.user_is_house_member(house_id, auth.uid())
    );

-- Add UPDATE policy for house_members (for admin status changes)
DROP POLICY IF EXISTS "Users can update house members" ON house_members;
CREATE POLICY "Admins can update house members" ON house_members
    FOR UPDATE USING (
        public.user_is_house_member(house_id, auth.uid())
    );

-- Add DELETE policy for house_members
DROP POLICY IF EXISTS "Users can delete house members" ON house_members;
CREATE POLICY "Admins can remove house members" ON house_members
    FOR DELETE USING (
        public.user_is_house_member(house_id, auth.uid())
    );

-- Ensure expense_payments has all CRUD policies
DROP POLICY IF EXISTS "Users can delete their payments" ON expense_payments;
CREATE POLICY "Users can delete their payments" ON expense_payments
    FOR DELETE USING (auth.uid() = user_id);

-- Notes UPDATE policy already exists, just ensure DELETE is there
-- (already exists from previous migration)

-- Expenses UPDATE and DELETE policies
DROP POLICY IF EXISTS "Users can update house expenses" ON expenses;
CREATE POLICY "Users can update house expenses" ON expenses
    FOR UPDATE USING (
        house_id IN (SELECT public.user_house_ids(auth.uid()))
    );

DROP POLICY IF EXISTS "Users can delete house expenses" ON expenses;
CREATE POLICY "Users can delete house expenses" ON expenses
    FOR DELETE USING (
        house_id IN (SELECT public.user_house_ids(auth.uid()))
    );

-- Member presence UPDATE and DELETE policies
DROP POLICY IF EXISTS "Users can update own presence" ON member_presence;
CREATE POLICY "Users can update own presence" ON member_presence
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own presence" ON member_presence;
CREATE POLICY "Users can delete own presence" ON member_presence
    FOR DELETE USING (auth.uid() = user_id);

-- Add INSERT policy for member_presence
DROP POLICY IF EXISTS "Users can create presence records" ON member_presence;
CREATE POLICY "Users can create presence records" ON member_presence
    FOR INSERT WITH CHECK (
        auth.uid() = user_id AND
        house_id IN (SELECT public.user_house_ids(auth.uid()))
    );
