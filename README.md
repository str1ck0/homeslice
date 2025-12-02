# Homeslice - Sharehouse Management App

A modern web application for managing your sharehouse at 20 Van Breda Street. Split costs, track expenses, manage notes, and stay coordinated with your housemates.

## Features

- **User Authentication**: Secure account creation and login
- **Profile Management**: Custom usernames and profile pictures
- **House Management**: Easy house joining with invite codes
- **Expense Splitting**:
  - One-off expenses with custom member selection
  - Recurring expenses (wifi, utilities, etc.)
  - Track who owes what
- **Notes & Knowledge Base**:
  - Shopping lists
  - House reminders
  - Important info (alarm codes, maintenance tasks)
- **Member Presence**: Check-in system to see who's home
- **Responsive Design**: Works on mobile, tablet, and desktop

## Tech Stack

- **Frontend**: Next.js 15, React 18, TypeScript
- **Styling**: Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Storage)
- **Hosting**: Vercel (free tier)

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Supabase account (free tier)
- A Vercel account (free tier, optional for deployment)

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Once your project is ready, go to Project Settings > API
3. Copy your project URL and anon/public key
4. Run the SQL migration:
   - Go to the SQL Editor in your Supabase dashboard
   - Copy the contents of `supabase/migrations/001_initial_schema.sql`
   - Paste and run it

### 3. Configure Environment Variables

Create a `.env.local` file in the root directory:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and add your Supabase credentials:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Set Up Storage Bucket (for profile pictures)

1. In Supabase Dashboard, go to Storage
2. Create a new bucket called `avatars`
3. Make it public by clicking the bucket > Settings > Make Public

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deployment to Vercel

1. Push your code to a Git repository (GitHub, GitLab, or Bitbucket)
2. Go to [vercel.com](https://vercel.com) and import your repository
3. Add your environment variables in the Vercel project settings
4. Deploy!

## Project Structure

```
homeslice/
├── src/
│   ├── app/              # Next.js app router pages
│   ├── components/       # React components
│   ├── lib/              # Utility functions and configs
│   └── types/            # TypeScript type definitions
├── supabase/
│   └── migrations/       # Database migration files
├── public/               # Static assets
└── package.json
```

## Database Schema

- **profiles**: User profiles with username and avatar
- **houses**: Sharehouse information
- **house_members**: Links users to houses
- **expenses**: One-off and recurring costs
- **expense_payments**: Track individual payment obligations
- **notes**: Knowledge base entries
- **member_presence**: Track who's home

## Future Enhancements

- Chore rotation tracker
- House calendar for events
- Photo gallery
- Push notifications for expenses
- Mobile app (React Native)
- Receipt photo uploads
- Automated recurring expense creation

## Contributing

This is a personal project for 20 Van Breda Street, but feel free to fork and adapt for your own sharehouse!

## License

MIT
