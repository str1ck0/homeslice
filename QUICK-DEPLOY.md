# Quick Deploy Checklist

Follow these steps in order:

## ☐ 1. Supabase (5 min)

1. Go to [supabase.com](https://supabase.com) → New Project
2. Name: `homeslice`, Choose region, Create password
3. Wait for setup
4. SQL Editor → New Query → Paste contents of `supabase/migrations/001_initial_schema.sql` → Run
5. Storage → Create bucket → Name: `avatars` → Public: ON → Create
6. Settings → API → Copy **Project URL** and **anon public key** (keep this tab open!)

## ☐ 2. GitHub (2 min)

1. Go to [github.com](https://github.com) → New repository
2. Name: `homeslice`, Description: "Sharehouse management app"
3. Do NOT initialize with README
4. Create repository
5. In terminal, run:
```bash
git remote add origin https://github.com/YOUR_USERNAME/homeslice.git
git branch -M main
git push -u origin main
```

## ☐ 3. Vercel (3 min)

1. Go to [vercel.com](https://vercel.com) → Import Project
2. Select your `homeslice` GitHub repo → Import
3. Add Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = (from Supabase tab)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (from Supabase tab)
4. Click Deploy
5. Wait 1-2 minutes
6. Visit your live site! 🎉

## ✅ Done!

Your app is live and CI/CD is active. Every git push auto-deploys!

---

## Quick Commands

### Deploy changes:
```bash
git add .
git commit -m "Your changes"
git push origin main
```

### Run locally:
```bash
npm run dev
```

### Check build:
```bash
npm run build
```

---

## Your Credentials

**Supabase Project URL**: `_________________________`

**Supabase Anon Key**: `_________________________`

**Vercel URL**: `_________________________`

**GitHub Repo**: `https://github.com/_____________/homeslice`

---

## Share with Housemates

1. Give them your Vercel URL
2. They sign up
3. You get the invite code from Members tab
4. They join with the code
5. Start using the app!
