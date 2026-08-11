-- Add avatar_url column to houses table
ALTER TABLE houses ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN houses.avatar_url IS 'URL to the house profile picture stored in Supabase Storage';
