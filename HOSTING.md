# Host on the Web (Render, Railway, Vercel)

Deploy the full app (React UI + API) to a public URL using **MongoDB Atlas** as the database.

**Recommended:** [Render.com](https://render.com) — free tier, one URL for everything.

**Login after deploy:** Username `MohanGowri` + your existing password (data must be in Atlas first).

---

## Before you deploy (required)

### 1. MongoDB Atlas

Follow **Part 1** in [DEPLOYMENT.md](./DEPLOYMENT.md) to create a free Atlas cluster and get your connection string:

```
mongodb+srv://USER:PASSWORD@cluster.mongodb.net/crusher_accounting?retryWrites=true&w=majority
```

### 2. Copy your local data to Atlas

Your login and business data live in local MongoDB today. Copy them to Atlas once:

```powershell
cd backend
$env:ATLAS_URI="mongodb+srv://USER:PASSWORD@cluster.mongodb.net/crusher_accounting?retryWrites=true&w=majority"
npm run migrate:atlas
```

### 3. Push code to GitHub

Hosting sites deploy from GitHub.

```powershell
cd s:\Cursher\crusher-accounting-system
git init
git add .
git commit -m "Prepare for cloud hosting"
```

Create a new repo on [github.com/new](https://github.com/new), then:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/crusher-accounting.git
git branch -M main
git push -u origin main
```

---

## Option A — Render.com (recommended, easiest)

One website URL serves both the app and API.

### Step 1: Create Render account

Sign up at [https://render.com](https://render.com) (free, connect GitHub).

### Step 2: New Web Service

1. Click **New +** → **Web Service**
2. Connect your GitHub repo `crusher-accounting`
3. Settings:

| Setting | Value |
|---------|-------|
| **Name** | `crusher-accounting` |
| **Region** | Singapore or closest to you |
| **Branch** | `main` |
| **Runtime** | Node |
| **Build Command** | `npm run build` |
| **Start Command** | `npm start` |
| **Plan** | Free |

### Step 3: Environment variables

In **Environment** add:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `MONGO_URI` | Your Atlas connection string |
| `JWT_SECRET` | Long random string (32+ chars) |
| `JWT_EXPIRES_IN` | `7d` |
| `SUPER_ADMIN_USERNAME` | `MohanGowri` |
| `CORS_ORIGIN` | `*` |

Generate JWT secret (PowerShell):

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

### Step 4: Deploy

Click **Create Web Service**. Render will build and deploy (5–10 minutes first time).

Your live URL will be:

```
https://crusher-accounting.onrender.com
```

### Step 5: Verify

Open:

```
https://YOUR-APP.onrender.com/api/health
```

Should show `"provider": "atlas"` and `"status": "connected"`.

Open the main URL and log in with **MohanGowri**.

### Free tier note

Render free services **sleep after 15 minutes** of no use. First visit after sleep may take ~30 seconds to wake up.

---

## Option B — Railway.app

1. Sign up at [https://railway.app](https://railway.app)
2. **New Project** → **Deploy from GitHub repo**
3. Select your repo
4. Railway reads `railway.toml` automatically
5. Add the same environment variables as Render (Step 3 above)
6. **Settings** → **Generate Domain** for a public URL

---

## Option C — Split: Vercel (frontend) + Render (backend)

Use this only if you want the UI on Vercel and API on Render.

### Backend on Render

1. Deploy backend only:
   - **Root Directory:** leave empty OR set start to backend only
   - Better: create a second Render service with:
     - Build: `npm install --prefix backend`
     - Start: `npm start --prefix backend`
2. Note the API URL: `https://crusher-api.onrender.com`

### Frontend on Vercel

1. Sign up at [https://vercel.com](https://vercel.com)
2. Import GitHub repo
3. **Root Directory:** `frontend`
4. **Environment variable:**
   - `VITE_API_URL` = `https://crusher-api.onrender.com/api`
5. Edit `vercel.json` — replace `YOUR-BACKEND.onrender.com` with your real Render URL
6. Deploy

---

## Environment variables reference

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGO_URI` | Yes | MongoDB Atlas connection string |
| `NODE_ENV` | Yes | `production` |
| `JWT_SECRET` | Yes | Random secret for login tokens |
| `SUPER_ADMIN_USERNAME` | Yes | `MohanGowri` |
| `JWT_EXPIRES_IN` | No | Default `7d` |
| `CORS_ORIGIN` | No | `*` or your site URL |
| `PORT` | No | Set automatically by host |

---

## After deployment

- **Custom domain:** Render → Settings → Custom Domains → add your domain
- **Updates:** Push to GitHub → host auto-redeploys
- **Logs:** Render Dashboard → your service → Logs
- **Atlas IP:** Keep **Network Access** as `0.0.0.0/0` so cloud servers can connect

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Build failed | Check Render logs; ensure `npm run build` works locally |
| `MongoDB connection error` | Wrong `MONGO_URI`, Atlas IP whitelist, or password not URL-encoded |
| Login fails | Run `migrate:atlas` so MohanGowri exists in Atlas |
| Blank page | `NODE_ENV=production` must be set; build must include `frontend/dist` |
| 502 / slow first load | Free Render tier waking from sleep — wait 30s and refresh |
| CORS error (split deploy) | Set `CORS_ORIGIN` to your Vercel URL |

---

## Quick checklist

- [ ] MongoDB Atlas cluster created
- [ ] Local data migrated to Atlas (`npm run migrate:atlas`)
- [ ] Code pushed to GitHub
- [ ] Render web service created with env vars
- [ ] Health check OK at `/api/health`
- [ ] Login works at your public URL
