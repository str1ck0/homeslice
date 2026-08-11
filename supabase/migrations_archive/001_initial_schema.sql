-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create profiles table
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Create houses table
CREATE TABLE houses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    invite_code TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- Create house_members table
CREATE TABLE house_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    house_id UUID REFERENCES houses(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    UNIQUE(house_id, user_id)
);

-- Create expenses table
CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    house_id UUID REFERENCES houses(id) ON DELETE CASCADE NOT NULL,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurrence_period TEXT,
    split_with UUID[] NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    due_date TIMESTAMP WITH TIME ZONE
);

-- Create expense_payments table
CREATE TABLE expense_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    paid BOOLEAN DEFAULT FALSE,
    paid_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(expense_id, user_id)
);

-- Create notes table
CREATE TABLE notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    house_id UUID REFERENCES houses(id) ON DELETE CASCADE NOT NULL,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Create member_presence table
CREATE TABLE member_presence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    house_id UUID REFERENCES houses(id) ON DELETE CASCADE NOT NULL,
    is_home BOOLEAN DEFAULT FALSE,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    UNIQUE(user_id, house_id)
);

-- Create indexes for better performance
CREATE INDEX idx_house_members_house_id ON house_members(house_id);
CREATE INDEX idx_house_members_user_id ON house_members(user_id);
CREATE INDEX idx_expenses_house_id ON expenses(house_id);
CREATE INDEX idx_expense_payments_expense_id ON expense_payments(expense_id);
CREATE INDEX idx_notes_house_id ON notes(house_id);
CREATE INDEX idx_member_presence_house_id ON member_presence(house_id);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE houses ENABLE ROW LEVEL SECURITY;
ALTER TABLE house_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_presence ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Public profiles are viewable by everyone" ON profiles
    FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- Houses policies
CREATE POLICY "Houses viewable by members" ON houses
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM house_members
            WHERE house_members.house_id = houses.id
            AND house_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Authenticated users can create houses" ON houses
    FOR INSERT WITH CHECK (auth.uid() = created_by);

-- House members policies
CREATE POLICY "House members viewable by house members" ON house_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM house_members hm
            WHERE hm.house_id = house_members.house_id
            AND hm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can join houses" ON house_members
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Expenses policies
CREATE POLICY "Expenses viewable by house members" ON expenses
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM house_members
            WHERE house_members.house_id = expenses.house_id
            AND house_members.user_id = auth.uid()
        )
    );

CREATE POLICY "House members can create expenses" ON expenses
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM house_members
            WHERE house_members.house_id = expenses.house_id
            AND house_members.user_id = auth.uid()
        )
    );

-- Expense payments policies
CREATE POLICY "Expense payments viewable by house members" ON expense_payments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM expenses e
            JOIN house_members hm ON hm.house_id = e.house_id
            WHERE e.id = expense_payments.expense_id
            AND hm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their own payments" ON expense_payments
    FOR UPDATE USING (auth.uid() = user_id);

-- Notes policies
CREATE POLICY "Notes viewable by house members" ON notes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM house_members
            WHERE house_members.house_id = notes.house_id
            AND house_members.user_id = auth.uid()
        )
    );

CREATE POLICY "House members can create notes" ON notes
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM house_members
            WHERE house_members.house_id = notes.house_id
            AND house_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own notes" ON notes
    FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete own notes" ON notes
    FOR DELETE USING (auth.uid() = created_by);

-- Member presence policies
CREATE POLICY "Presence viewable by house members" ON member_presence
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM house_members
            WHERE house_members.house_id = member_presence.house_id
            AND house_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own presence" ON member_presence
    FOR ALL USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
