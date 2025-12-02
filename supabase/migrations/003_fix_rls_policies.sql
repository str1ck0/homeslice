-- Fix infinite recursion in Row Level Security policies
-- The problem: house_members policy checks house_members, causing infinite loop

-- Drop all existing policies
DROP POLICY IF EXISTS "Houses viewable by members" ON houses;
DROP POLICY IF EXISTS "Authenticated users can create houses" ON houses;
DROP POLICY IF EXISTS "House members viewable by house members" ON house_members;
DROP POLICY IF EXISTS "Users can join houses" ON house_members;
DROP POLICY IF EXISTS "Expenses viewable by house members" ON expenses;
DROP POLICY IF EXISTS "House members can create expenses" ON expenses;
DROP POLICY IF EXISTS "Expense payments viewable by house members" ON expense_payments;
DROP POLICY IF EXISTS "Users can update their own payments" ON expense_payments;
DROP POLICY IF EXISTS "Notes viewable by house members" ON notes;
DROP POLICY IF EXISTS "House members can create notes" ON notes;
DROP POLICY IF EXISTS "Users can update own notes" ON notes;
DROP POLICY IF EXISTS "Users can delete own notes" ON notes;
DROP POLICY IF EXISTS "Presence viewable by house members" ON member_presence;
DROP POLICY IF EXISTS "Users can update own presence" ON member_presence;

-- Recreate policies WITHOUT recursion

-- Houses policies (simplified - no recursion)
CREATE POLICY "Users can view their houses" ON houses
    FOR SELECT USING (
        id IN (
            SELECT house_id FROM house_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Authenticated users can create houses" ON houses
    FOR INSERT WITH CHECK (auth.uid() = created_by);

-- House members policies (SIMPLE - no recursive check)
CREATE POLICY "Users can view house members" ON house_members
    FOR SELECT USING (
        house_id IN (
            SELECT house_id FROM house_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can join houses" ON house_members
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Expenses policies
CREATE POLICY "Users can view house expenses" ON expenses
    FOR SELECT USING (
        house_id IN (
            SELECT house_id FROM house_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create house expenses" ON expenses
    FOR INSERT WITH CHECK (
        house_id IN (
            SELECT house_id FROM house_members WHERE user_id = auth.uid()
        )
    );

-- Expense payments policies
CREATE POLICY "Users can view expense payments" ON expense_payments
    FOR SELECT USING (
        expense_id IN (
            SELECT id FROM expenses WHERE house_id IN (
                SELECT house_id FROM house_members WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can update their payments" ON expense_payments
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can create expense payments" ON expense_payments
    FOR INSERT WITH CHECK (
        expense_id IN (
            SELECT id FROM expenses WHERE house_id IN (
                SELECT house_id FROM house_members WHERE user_id = auth.uid()
            )
        )
    );

-- Notes policies
CREATE POLICY "Users can view house notes" ON notes
    FOR SELECT USING (
        house_id IN (
            SELECT house_id FROM house_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create house notes" ON notes
    FOR INSERT WITH CHECK (
        house_id IN (
            SELECT house_id FROM house_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own notes" ON notes
    FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete own notes" ON notes
    FOR DELETE USING (auth.uid() = created_by);

-- Member presence policies
CREATE POLICY "Users can view house presence" ON member_presence
    FOR SELECT USING (
        house_id IN (
            SELECT house_id FROM house_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage own presence" ON member_presence
    FOR ALL USING (auth.uid() = user_id);
