# Crusher Accounting System — Deployment Guide

Production login uses your **existing super admin account only**:

| Field | Value |
|-------|-------|
| **Username** | `MohanGowri` |
| **Password** | Your existing password (unchanged) |

---

## Recommended setup: MongoDB Atlas + one backend for all systems

All office PCs, laptops, and browsers use **one backend API** connected to **one MongoDB Atlas database**. Every system sees the same customers, bills, and reports in real time.

```
  PC 1 (browser)  ──┐
  PC 2 (browser)  ──┼──►  Backend API (port 5000)  ──►  MongoDB Atlas (cloud)
  PC 3 (browser)  ──┘
```

You do **not** need MongoDB installed on every PC — only on the server (or use Atlas only).

---

## Part 1 — Create MongoDB Atlas (one time)

### Step 1: Create a free Atlas cluster

1. Go to [https://www.mongodb.com/cloud/atlas/register](https://www.mongodb.com/cloud/atlas/register)
2. Create a **free M0 cluster**
3. Choose a cloud region close to you (e.g. Mumbai / Singapore)

### Step 2: Create a database user

1. In Atlas: **Database Access** → **Add New Database User**
2. Authentication: **Password**
3. Username: e.g. `crusher_admin`
4. Password: create a strong password (save it)
5. Role: **Atlas admin** or **Read and write to any database**
6. Click **Add User**

### Step 3: Allow network access

1. In Atlas: **Network Access** → **Add IP Address**
2. For office testing: **Allow Access from Anywhere** (`0.0.0.0/0`)
   - For better security later, add only your office public IP
3. Click **Confirm**

### Step 4: Get the connection string

1. In Atlas: **Database** → **Connect** → **Drivers**
2. Copy the connection string. It looks like:

```
mongodb+srv://crusher_admin:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

3. Replace `<password>` with your real password
4. Add the database name **`crusher_accounting`** before the `?`:

```
mongodb+srv://crusher_admin:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/crusher_accounting?retryWrites=true&w=majority
```

**If your password contains special characters**, URL-encode them:

| Character | Use |
|-----------|-----|
| `@` | `%40` |
| `#` | `%23` |
| `/` | `%2F` |
| `:` | `%3A` |

---

## Part 2 — Move your existing data to Atlas (one time)

If you already have data in local MongoDB, copy it to Atlas.

### Step 1: Install MongoDB Database Tools

Download from [https://www.mongodb.com/try/download/database-tools](https://www.mongodb.com/try/download/database-tools)

### Step 2: Run migration

```powershell
cd s:\Cursher\crusher-accounting-system\backend
```

Set your Atlas URI temporarily:

```powershell
$env:ATLAS_URI="mongodb+srv://crusher_admin:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/crusher_accounting?retryWrites=true&w=majority"
npm run migrate:atlas
```

Or use mongodump / mongorestore manually:

```powershell
mongodump --uri="mongodb://127.0.0.1:27017/crusher_accounting" --out=backup
mongorestore --uri="YOUR_ATLAS_URI" --drop backup/crusher_accounting
```

---

## Part 3 — Configure the backend for Atlas

Edit `backend\.env`:

```env
PORT=5000
NODE_ENV=production
MONGO_URI=mongodb+srv://crusher_admin:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/crusher_accounting?retryWrites=true&w=majority
JWT_SECRET=PASTE_A_LONG_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
JWT_EXPIRES_IN=7d
SUPER_ADMIN_USERNAME=MohanGowri

# Allow all office PCs to use the API (if needed)
CORS_ORIGIN=*
```

Generate JWT secret (PowerShell):

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

### Verify Atlas connection

```powershell
cd backend
npm install
npm run verify:atlas
```

Expected:

```
MongoDB Atlas connected: cluster0-shard-00-00.xxxxx.mongodb.net
Database: crusher_accounting
Connection verified successfully
```

### Prepare single super admin

```powershell
npm run prepare:production
```

---

## Part 4 — Build and start the backend (serves all systems)

```powershell
cd s:\Cursher\crusher-accounting-system\frontend
npm install
npm run build

cd ..\backend
npm start
```

Open on the server PC: **http://localhost:5000**

Login: **MohanGowri** + your existing password

Health check:

```
http://localhost:5000/api/health
```

Should show:

```json
{
  "status": "ok",
  "database": {
    "status": "connected",
    "provider": "atlas",
    "name": "crusher_accounting"
  }
}
```

---

## Part 5 — Connect all other systems (office PCs)

### On the server PC

1. Find server IP:

```powershell
ipconfig
```

Example: `192.168.1.50`

2. Open firewall port 5000:

```powershell
New-NetFirewallRule -DisplayName "Crusher Accounting" -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow
```

### On every other PC in the office

Open in Chrome/Edge:

```
http://192.168.1.50:5000
```

Log in with the same admin accounts. All data comes from MongoDB Atlas through the one backend.

### Optional: run backend on multiple PCs (same Atlas database)

If you want the API running on more than one machine, install the project on each PC, use the **same `MONGO_URI`** in each `backend\.env`, and start `npm start` on each. All instances share the same Atlas data.

---

## Part 6 — Keep running after reboot (PM2)

```powershell
npm install -g pm2
cd s:\Cursher\crusher-accounting-system\backend
pm2 start server.js --name crusher-accounting
pm2 save
pm2 startup
```

---

## Environment variables reference

| Variable | Purpose |
|----------|---------|
| `MONGO_URI` | MongoDB Atlas or local connection string |
| `NODE_ENV` | Set to `production` for deployment |
| `JWT_SECRET` | Secret key for login tokens |
| `SUPER_ADMIN_USERNAME` | Must be `MohanGowri` |
| `CORS_ORIGIN` | `*` or comma-separated URLs for other systems |
| `PORT` | API port (default `5000`) |

---

## Security checklist

- [ ] Strong Atlas database password
- [ ] Strong unique `JWT_SECRET`
- [ ] `NODE_ENV=production`
- [ ] Atlas Network Access restricted to your office IP (when possible)
- [ ] Only **MohanGowri** is super admin (`npm run prepare:production`)
- [ ] Staff use regular admin accounts, not super admin
- [ ] Enable Atlas backup (free tier has limited backup; paid tiers have full backup)

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `MongoDB connection error` | Check `MONGO_URI`, Atlas IP whitelist, password encoding |
| `Authentication failed` | Wrong Atlas username/password in connection string |
| `Server selection timed out` | Atlas cluster paused, wrong URI, or firewall blocking outbound 27017 |
| Login fails | Username `MohanGowri`, existing password |
| Other PC cannot connect | Check server IP, firewall, same Wi‑Fi/LAN |
| Blank page | Run `npm run build` in `frontend` |
| CORS error from another app | Set `CORS_ORIGIN=*` or add that URL |

---

## Local MongoDB (development only)

For development on your PC without Atlas:

```env
MONGO_URI=mongodb://127.0.0.1:27017/crusher_accounting
NODE_ENV=development
```

Run separately:

```powershell
# Terminal 1
cd backend
npm run dev

# Terminal 2
cd frontend
npm run dev
```

Open **http://localhost:5173**
