# SOP SaaS (Standard Operating Procedure Management Platform)

A modern, multi-tenant Standard Operating Procedure (SOP) management platform featuring a React front-end, an Express back-end with TypeScript, and a PostgreSQL database managed via Prisma ORM.

---

## 🚀 Quick Start

From the root directory, you can run both the client and server using the npm workspace commands:

```bash
# Install dependencies for both client and server
npm install

# Run the development servers concurrently
# (Make sure to configure your environment variables first!)
npm run dev:server
npm run dev:client
```

---

## 🛠️ Tech Stack

### Frontend (`/client`)
- **Framework:** React 19 (TypeScript)
- **Build Tool:** Vite
- **Routing & State:** React hooks
- **Mapping/Geofencing:** Leaflet & React-Leaflet
- **Styling:** CSS Modules / Vanilla CSS

### Backend (`/server`)
- **Runtime & Language:** Node.js, TypeScript, `tsx` (TypeScript Execute)
- **Framework:** Express
- **ORM:** Prisma
- **Database:** PostgreSQL
- **Security:** JWT (JSON Web Tokens) & `bcrypt` for password hashing
- **File Uploads:** `multer` for memory storage processing

---

## 📂 Project Structure

```text
sop-saas/
├── client/                 # React Frontend Application
│   ├── src/                # Components, Pages, and Styling
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── server/                 # Express Backend API
│   ├── src/                # Routes, Middleware, context, and Utils
│   │   ├── routes/         # auth, sops, attendance, leave, payroll, dashboard, admin
│   │   ├── middleware/     # Auth and tenant context handling
│   │   └── utils/          # Upload and helper functions
│   ├── prisma/             # Schema configuration
│   ├── scripts/            # Helper scripts
│   ├── .env.example
│   └── package.json
├── package.json            # Root workspaces configuration
└── schema.sql              # Raw SQL Schema backup
```

---

## ⚙️ Backend Setup & Configuration

1. **Environment Variables:**
   Navigate to the `/server` directory and copy the template `.env.example` to a new `.env` file:
   ```bash
   cd server
   cp .env.example .env
   ```
   Configure the environment variables:
   ```env
   DATABASE_URL="postgresql://app_user:your-password@localhost:5432/sop_saas"
   JWT_SECRET="your-random-secret-here"
   PORT=5000
   ```

2. **Database Initialization:**
   Ensure PostgreSQL is running, then run Prisma migrations to build your database tables:
   ```bash
   npx prisma migrate dev --name init
   ```

3. **Running the Server:**
   ```bash
   npm run dev
   ```
   The backend API will run on `http://localhost:5000`. You can test connection health by visiting `http://localhost:5000/health`.

---

## 💻 Frontend Setup

1. **Running the Client:**
   Navigate to the `/client` directory and start Vite:
   ```bash
   cd client
   npm run dev
   ```
   The frontend will run on `http://localhost:5173`.

---

## 🌟 Key Features

- **Multi-Tenant SOP Execution:** SOPs are scoped by tenant, allowing isolated organizations to use the application safely.
- **Checklist Run Logging:** Steps within an SOP can be executed with logs and evidence photo uploads.
- **Attendance & Leave Management:** Staff can request leaves and mark attendance.
- **Payroll & Admin Dashboard:** Summary metrics, system oversight, and administration tools.
