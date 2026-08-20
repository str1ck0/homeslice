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
- A container runtime for the local database — OrbStack or Docker
- A Supabase account only if you are deploying; not needed to develop
- A Vercel account (free tier, optional for deployment)

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the local database

Development runs against a Supabase stack on your own machine. You do **not**
need a Supabase account to work on this app, and you should not point it at the
hosted project — see [docs/DATABASE.md](docs/DATABASE.md) for why.

```bash
brew install --cask orbstack   # container runtime, once
supabase start                 # once per boot
```

That gives you Postgres, Auth, Storage and a mail catcher, applies every
migration, and loads `supabase/seed.sql` — four invented people with expenses
in two currencies, a group, payments, and a deleted expense.

`.env.local` already points at it. The keys in that file are the standard local
demo keys: identical on every machine that has ever run Supabase locally, and
worthless outside 127.0.0.1.

### 3. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in as
`devin@homeslice.test` with the password `password123`. Emails the app sends —
magic links, password resets — land in the mail catcher at
[http://127.0.0.1:54324](http://127.0.0.1:54324) rather than a real inbox.

### 4. Everyday commands

```bash
npm test                   # unit tests, no database
npm run typecheck
npm run test:integration   # against the local stack
supabase db reset          # rebuild the database from migrations + seed
./scripts/db-diff.sh       # does local still match production?
```

`supabase db reset` is the normal way to undo an experiment. Nothing in the
local database is worth keeping.

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
