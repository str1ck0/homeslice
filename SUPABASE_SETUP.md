# Supabase Configuration Guide

## Disable Email Confirmation

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/zwnhbhymjaqjpuxfcbam
2. Click **"Authentication"** in the left sidebar
3. Click **"Providers"**
4. Find **"Email"** in the list
5. Toggle **"Confirm email"** to **OFF**
6. Click **"Save"**

Now users can sign up without email confirmation!

---

## User Management & Admin Access

### Delete a User (via Supabase Dashboard)

1. Go to: https://supabase.com/dashboard/project/zwnhbhymjaqjpuxfcbam/auth/users
2. Find the user in the list
3. Click the **"..."** menu on the right
4. Click **"Delete User"**
5. Confirm deletion

### Current Security Model

Right now, **users CANNOT delete other users** through the app. Here's what's protected:

#### What Users Can Do:
- ✅ Create/edit their own profile
- ✅ Create houses and get invite codes
- ✅ Join houses with invite codes
- ✅ Add expenses for their house
- ✅ Create notes for their house
- ✅ Delete their own notes
- ✅ Update their own check-in status

#### What Users CANNOT Do:
- ❌ Delete other users
- ❌ Delete other people's notes
- ❌ See houses they're not a member of
- ❌ See expenses/notes from other houses
- ❌ Access Supabase admin functions

### House Admin Features (Currently Basic)

Each house has an `is_admin` flag on the `house_members` table:
- The person who **creates** the house is automatically an admin
- Admins currently have the same permissions as regular members

### Future Admin Features (Not Yet Implemented)

You could add these features:
- Remove members from the house
- Delete any note (not just their own)
- Edit/delete any expense
- Transfer admin status to another member
- Change house details (name, address)

---

## Making Yourself a Super Admin (via SQL)

If you want database-level admin access to manage all users:

### Option 1: Use Supabase Dashboard SQL Editor

1. Go to: https://supabase.com/dashboard/project/zwnhbhymjaqjpuxfcbam/sql/new
2. Run this to see all users:
```sql
SELECT id, email, created_at FROM auth.users;
```

3. To delete a specific user:
```sql
DELETE FROM auth.users WHERE email = 'user@example.com';
```

### Option 2: Create an Admin Table

Add an `admins` table to track super admins:

```sql
-- Create admins table
CREATE TABLE admins (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Make yourself an admin (replace with your user ID)
INSERT INTO admins (id) VALUES ('your-user-id-here');
```

Then you could build admin pages in the app that check if the user is in the `admins` table.

---

## Recommended Setup for Your Sharehouse

Since this is for 20 Van Breda Street with trusted housemates:

1. **Disable email confirmation** ✅ (easier signup)
2. **Keep Row Level Security** ✅ (data stays private between houses)
3. **House admins** can manage their own house
4. **You (Liam) as database admin** can manage everything via Supabase dashboard

This keeps it simple and secure!

---

## Quick Reference: Supabase Dashboard Links

- **Users**: https://supabase.com/dashboard/project/zwnhbhymjaqjpuxfcbam/auth/users
- **SQL Editor**: https://supabase.com/dashboard/project/zwnhbhymjaqjpuxfcbam/sql/new
- **Database Tables**: https://supabase.com/dashboard/project/zwnhbhymjaqjpuxfcbam/editor
- **Auth Settings**: https://supabase.com/dashboard/project/zwnhbhymjaqjpuxfcbam/settings/auth
- **API Keys**: https://supabase.com/dashboard/project/zwnhbhymjaqjpuxfcbam/settings/api
