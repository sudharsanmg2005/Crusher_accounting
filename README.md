# Crusher Accounting System

A complete full-stack accounting system for a crusher business built with MongoDB, Express.js, React, and Node.js.

## Production deployment (MongoDB Atlas — all systems)

| Guide | Use for |
|-------|---------|
| **[HOSTING.md](./HOSTING.md)** | Deploy to **Render / Railway / Vercel** (public website URL) |
| **[DEPLOYMENT.md](./DEPLOYMENT.md)** | Run on your **office PC** or LAN |

**Super admin login:** `MohanGowri` + your existing password

## Prerequisites
- Node.js installed
- MongoDB installed and running locally on port `27017` (or configured via `.env`)

## How to Run in VS Code

You need two separate terminal windows in VS Code to run both the backend and frontend at the same time.

### Step 1: Start the Backend Server
1. Open a new terminal in VS Code (`Ctrl` + `` ` `` or **Terminal** > **New Terminal**).
2. Navigate to the backend directory:
   ```bash
   cd backend
   ```
3. Install dependencies (only required the first time):
   ```bash
   npm install
   ```
4. Start the backend development server:
   ```bash
   npm run dev
   ```
   *You should see "MongoDB connected" and "Server running on port 5000".*

### Step 2: Start the Frontend Application
1. Open a **second** terminal window in VS Code (click the **+** icon in the terminal panel).
2. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
3. Install dependencies (only required the first time):
   ```bash
   npm install
   ```
4. Start the frontend application:
   ```bash
   npm run dev
   ```
   *It will give you a local URL (usually `http://localhost:5173/`). `Ctrl` + Click (or `Cmd` + Click on Mac) the link to open it in your browser.*

### Testing the Integration
Once both servers are running:
1. Open the frontend URL in your browser.
2. Go to **Customers** and add a test customer.
3. Go to **Materials** and add a test material.
4. Go to **Bills** and generate a new bill using the customer and material you created.
5. Check the **Dashboard** to see the data update.
