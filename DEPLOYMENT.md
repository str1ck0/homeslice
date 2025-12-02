# Deployment Guide - Homeslice

This guide will walk you through deploying Homeslice with CI/CD from GitHub to Vercel.

## Overview

We'll set up:
1. ✅ Supabase (database & auth)
2. ✅ GitHub (version control)
3. ✅ Vercel (hosting with auto-deploy on push)

---

## 1. Supabase Setup

### A. Create Project (if you haven't already)

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **"New Project"**
3. Fill in:
   - **Name**: `homeslice`
   - **Database Password**: Create a strong password (SAVE THIS!)
   - **Region**: Choose closest to you
4. Click **"Create new project"**
5. Wait 1-2 minutes for setup to complete

### B. Run Database Migration

1. In your Supabase dashboard, click **"SQL Editor"** in the left sidebar
2. Click **"New Query"**
3. Copy the **entire contents** of `supabase/migrations/001_initial_schema.sql`
4. Paste into the SQL editor
5. Click **"Run"** (or press Cmd/Ctrl + Enter)
6. You should see "Success. No rows returned" ✅

### C. Create Storage Bucket

1. Click **"Storage"** in the left sidebar
2. Click **"Create a new bucket"**
3. Set name to: `avatars`
4. Toggle **"Public bucket"** to **ON**
5. Click **"Create bucket"**

### D. Get API Credentials

1. Click **"Settings"** (gear icon) in the left sidebar
2. Click **"API"**
3. You'll need two values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: Long string starting with `eyJ...`

**Keep this tab open** - you'll need these values for Vercel!

---

## 2. GitHub Setup

### A. Create GitHub Repository

1. Go to [github.com](https://github.com) and sign in
2. Click the **"+"** in top right → **"New repository"**
3. Fill in:
   - **Repository name**: `homeslice`
   - **Description**: "Sharehouse management app for 20 Van Breda Street"
   - **Visibility**: Choose Public or Private
   - ⚠️ **Do NOT** initialize with README (we already have one)
4. Click **"Create repository"**

### B. Push Your Code

GitHub will show you commands. Run these in your terminal:

```bash
git remote add origin https://github.com/YOUR_USERNAME/homeslice.git
git branch -M main
git push -u origin main
```

Replace `YOUR_USERNAME` with your actual GitHub username.

**Note**: If you're asked to authenticate, use:
- Username: Your GitHub username
- Password: A [Personal Access Token](https://github.com/settings/tokens) (not your account password)

---

## 3. Vercel Deployment with CI/CD

### A. Import Project from GitHub

1. Go to [vercel.com](https://vercel.com) and sign in (use your GitHub account)
2. Click **"Add New..."** → **"Project"**
3. You'll see a list of your GitHub repos
4. Find **"homeslice"** and click **"Import"**

### B. Configure Project

1. **Framework Preset**: Should auto-detect as "Next.js" ✅
2. **Root Directory**: Leave as `./`
3. **Build Command**: Leave default (`next build`)
4. **Output Directory**: Leave default (`.next`)

### C. Add Environment Variables

Click **"Environment Variables"** and add these two variables:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon public key |

Get these from the Supabase tab you left open!

### D. Deploy!

1. Click **"Deploy"**
2. Vercel will:
   - Clone your repo
   - Install dependencies
   - Build your project
   - Deploy it globally
3. This takes 1-2 minutes
4. When done, you'll see "Congratulations! 🎉"

### E. Get Your Live URL

Click **"Visit"** or copy your URL (looks like `homeslice-xxxxx.vercel.app`)

---

## 4. CI/CD is Now Active! 🚀

**Automatic deployments are set up!** Here's what happens now:

### Every time you push to GitHub:
1. Vercel detects the push
2. Automatically builds your app
3. Deploys the new version
4. Updates your live URL

### To deploy changes:
```bash
# Make your changes to the code
git add .
git commit -m "Description of changes"
git push origin main
```

That's it! Vercel handles the rest automatically.

### View Deployment Status:
- Go to your Vercel dashboard
- Click on your project
- See all deployments and their status

---

## 5. Testing Your Deployment

1. Visit your Vercel URL
2. Click **"Get Started"**
3. Sign up with your email
4. Create your house
5. Test all features!

---

## 6. Custom Domain (Optional)

Want to use your own domain instead of `*.vercel.app`?

1. In Vercel, go to your project
2. Click **"Settings"** → **"Domains"**
3. Add your domain
4. Follow the DNS configuration instructions
5. Vercel provides free HTTPS automatically!

---

## Troubleshooting

### "Error: supabaseUrl is required"
- Make sure you added both environment variables in Vercel
- Redeploy: Click "Deployments" → Click "..." on latest → "Redeploy"

### "Invalid invite code" when joining house
- Make sure you ran the SQL migration in Supabase
- Check that the `houses` table exists

### Build fails on Vercel
- Check the build logs in Vercel dashboard
- Make sure your code builds locally: `npm run build`

### Changes not showing after push
- Check Vercel dashboard - deployment might have failed
- Check your git push was successful: `git status`

---

## Managing Secrets

⚠️ **IMPORTANT**: Never commit `.env.local` to GitHub!

The `.gitignore` file already excludes it, but always check:
```bash
git status
```

If you see `.env.local` listed, do NOT commit it!

---

## Monitoring & Analytics

Vercel provides:
- **Analytics**: See pageviews, visitors
- **Speed Insights**: Performance metrics
- **Logs**: Runtime logs for debugging

Access these in your Vercel project dashboard.

---

## Next Steps

Now that you're deployed:

1. Share your URL with housemates
2. Everyone creates an account
3. Share the invite code (from Members tab)
4. Start tracking expenses and notes!

For any issues, check:
- Vercel deployment logs
- Supabase dashboard (Database, Auth, Storage tabs)
- Browser console for errors

Enjoy your automated CI/CD pipeline! 🎉
