# Homeslice Features

## Core Features

### 1. User Authentication & Profiles
- Secure email/password authentication via Supabase
- Custom usernames
- Profile picture upload
- User profile management page

### 2. House Management
- Create multiple houses
- Join houses using unique invite codes
- View all houses you're a member of
- Each house has its own dedicated space

### 3. Expense Splitting
#### One-off Expenses
- Add individual expenses (e.g., groceries, household items)
- Choose which members to split with
- Automatic per-person calculation
- Track who added each expense

#### Recurring Expenses
- Mark expenses as recurring (weekly, monthly, quarterly)
- Perfect for wifi, utilities, subscriptions
- Same splitting logic as one-off expenses

#### Expense Tracking
- View all expenses in chronological order
- See amount per person for each expense
- Know who created each expense

### 4. Notes & Knowledge Base
Multiple categories for organization:
- **Shopping**: Shopping lists, items to buy
- **Reminder**: Things to remember, tasks to do
- **Info**: Important information (alarm codes, wifi password)
- **Maintenance**: Things that need fixing or maintenance
- **General**: Anything else

Features:
- Filter by category
- See who created each note and when
- Delete your own notes
- Rich text content support

### 5. Member Presence System
- Check-in/check-out functionality
- See who's currently home at a glance
- Real-time status updates (refreshes every 30 seconds)
- Dashboard showing how many members are home
- Perfect for coordinating activities or knowing if someone's around

### 6. Members Tab
- View all house members
- See when each member joined
- Display invite code for new members
- Easy code copying
- Member avatars with initials

## Technical Features

### Security
- Row Level Security (RLS) policies on all tables
- Users can only see data for houses they're members of
- Users can only edit their own profiles and notes
- Secure authentication with Supabase

### Performance
- Optimized database queries with indexes
- Client-side state management
- Real-time data updates
- Responsive design for mobile, tablet, and desktop

### User Experience
- Dark mode support
- Beautiful gradient UI
- Intuitive navigation with tabs
- Modal dialogs for quick actions
- Loading states and error handling
- Form validation

## Database Schema

### Tables
- **profiles**: User information (username, avatar)
- **houses**: House details (name, address, invite code)
- **house_members**: Links users to houses
- **expenses**: One-off and recurring expenses
- **expense_payments**: Individual payment tracking
- **notes**: Knowledge base entries with categories
- **member_presence**: Check-in/out status

### Relationships
- Users can belong to multiple houses
- Each house can have multiple members
- Expenses are scoped to a house
- Notes are scoped to a house
- Presence is tracked per user per house

## Future Enhancement Ideas

### Short Term
- Mark individual expense payments as paid/unpaid
- Edit existing expenses and notes
- Expense payment history
- Total owed calculation per member
- Member admin controls

### Medium Term
- Chore rotation scheduler
- House calendar for events
- Photo gallery for house memories
- Push notifications for new expenses
- Expense categories and filtering
- Monthly expense summaries

### Long Term
- Receipt photo upload for expenses
- Automated recurring expense creation
- Expense splitting presets (e.g., "everyone", "upstairs", etc.)
- Mobile app (React Native)
- Integration with payment apps (Venmo, PayPal)
- Expense charts and analytics
- House rules and agreements section

## Tech Stack

- **Frontend**: Next.js 15, React 18, TypeScript
- **Styling**: Tailwind CSS with custom color scheme
- **Backend**: Supabase (PostgreSQL, Auth, Storage)
- **Hosting**: Vercel (free tier)
- **Version Control**: Git

## Why This Stack?

- **Next.js**: Modern React framework with great DX
- **TypeScript**: Type safety prevents bugs
- **Tailwind**: Rapid UI development
- **Supabase**: Free tier includes everything needed (database, auth, storage)
- **Vercel**: Free hosting with automatic deployments

All of this runs on free tiers, making it cost-effective for a sharehouse!
