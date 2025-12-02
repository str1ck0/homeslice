-- Fix: Ensure profile exists for the current user
-- Run this if you get "failed to create house" errors

-- First, let's see if your profile exists
-- SELECT * FROM profiles WHERE id = auth.uid();

-- If no profile exists, create one manually:
-- Replace 'your-username' with your actual username
-- INSERT INTO profiles (id, username)
-- VALUES (auth.uid(), 'stricko');

-- Better solution: Create a trigger to auto-create profiles on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger the function every time a user is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Also add a policy to allow users to insert their own profile
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
