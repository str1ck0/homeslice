# Homeslice Setup Guide

Follow these steps to get your sharehouse management app up and running!

## Step 1: Supabase Setup

### Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up or log in
2. Click "New Project"
3. Fill in the details:
   - **Name**: Homeslice (or any name you prefer)
   - **Database Password**: Create a strong password (save this!)
   - **Region**: Choose the closest region to you
4. Click "Create new project" and wait for it to finish setting up (1-2 minutes)

### Run the Database Migration

1. In your Supabase dashboard, click on the **SQL Editor** in the left sidebar
2. Click "New Query"
3. Open the file `supabase/migrations/001_initial_schema.sql` in this project
4. Copy ALL the contents of that file
5. Paste it into the SQL Editor in Supabase
6. Click "Run" (or press Cmd/Ctrl + Enter)
7. You should see "Success. No rows returned" - this is good!

### Get Your API Keys

1. In Supabase, click on **Settings** (gear icon) in the left sidebar
2. Click **API** in the settings menu
3. You'll see two important values:
   - **Project URL**: Something like `https://abcdefghij.supabase.co`
   - **anon/public key**: A long string starting with `eyJ...`
4. Keep this page open, you'll need these values next

### Set Up Storage for Profile Pictures

1. In Supabase, click **Storage** in the left sidebar
2. Click "Create a new bucket"
3. Set the name to: `avatars`
4. Make it **Public** (toggle the public option ON)
5. Click "Create bucket"

## Step 2: Configure Your Environment Variables

1. In your project directory, find the file `.env.local.example`
2. Create a copy of it called `.env.local`:
   ```bash
   cp .env.local.example .env.local
   ```
3. Open `.env.local` in your text editor
4. Replace the placeholder values with your Supabase credentials:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-url.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   ```

## Step 3: Install Dependencies & Run

```bash
npm install
npm run dev
```

The app will start on [http://localhost:3000](http://localhost:3000)

## Step 4: Create Your First Account

1. Open [http://localhost:3000](http://localhost:3000) in your browser
2. Click "Get Started"
3. Click "Don't have an account? Sign up"
4. Enter your:
   - Username (e.g., "stricko")
   - Email
   - Password (at least 6 characters)
5. Click "Sign Up"

## Step 5: Create Your House

1. After signing up, you'll see the dashboard
2. Click "Create House"
3. Enter:
   - **House Name**: "20 Van Breda Street" (or whatever you want)
   - **Address**: "20 Van Breda Street"
4. Click "Create"
5. You'll now see your house listed!

## Step 6: Get Your Invite Code

1. Click on your house to enter it
2. Click the "Members" tab
3. Click "Invite Code"
4. Share this code with your housemates so they can join!

## Step 7: Invite Your Housemates

Send your housemates these instructions:

1. Go to [http://localhost:3000](http://localhost:3000) (or your deployed URL)
2. Sign up with their email
3. On the dashboard, click "Join House"
4. Enter the invite code you gave them
5. They're in!

## Troubleshooting

### "Error loading..." messages
- Check that your `.env.local` file has the correct Supabase credentials
- Make sure you ran the database migration SQL

### "Failed to create profile"
- Check that the SQL migration ran successfully
- The `profiles` table should exist in your Supabase database

### Can't upload profile picture
- Make sure you created the `avatars` bucket in Supabase Storage
- Make sure the bucket is set to Public

### Build errors
- Run `npm install` again
- Delete the `.next` folder and `node_modules`, then run `npm install` again

## Deploying to Vercel (Optional)

Once everything works locally:

1. Push your code to GitHub (create a new repo)
2. Go to [vercel.com](https://vercel.com)
3. Click "Import Project"
4. Select your GitHub repo
5. In "Environment Variables", add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
6. Click "Deploy"
7. Share your new URL with your housemates!

## Next Steps

Now you can:
- Add expenses in the Expenses tab
- Create notes in the Notes tab
- Check in/out in the Members tab
- Update your profile picture and username

Enjoy managing your sharehouse with Homeslice!
