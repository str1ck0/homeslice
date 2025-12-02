-- Create notes_images table for note attachments
CREATE TABLE IF NOT EXISTS notes_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS notes_images_note_id_idx ON notes_images(note_id);

-- Enable RLS
ALTER TABLE notes_images ENABLE ROW LEVEL SECURITY;

-- Policies: Users can view images for notes in their houses
CREATE POLICY "Users can view note images" ON notes_images
    FOR SELECT USING (
        note_id IN (
            SELECT id FROM notes WHERE house_id IN (
                SELECT public.user_house_ids(auth.uid())
            )
        )
    );

-- Users can add images to notes in their houses
CREATE POLICY "Users can add note images" ON notes_images
    FOR INSERT WITH CHECK (
        note_id IN (
            SELECT id FROM notes WHERE house_id IN (
                SELECT public.user_house_ids(auth.uid())
            )
        )
    );

-- Users can delete images from their own notes
CREATE POLICY "Users can delete own note images" ON notes_images
    FOR DELETE USING (
        note_id IN (
            SELECT id FROM notes WHERE created_by = auth.uid()
        )
    );
