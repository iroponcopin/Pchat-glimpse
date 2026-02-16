# Glimpse pChat

Real-time web messenger with an iMessage-inspired UI. Built with React + Express + Socket.IO + Prisma.

## Features

- 📱 iMessage-style bubble UI (mobile-first, desktop split-view)
- 👤 Email/password authentication with bcrypt + JWT
- 🤝 Connection (friend) requests — accept, reject, re-request
- 💬 1:1 real-time messaging via WebSocket
- ✏️ Edit messages (within 15 minutes)
- ↩️ Undo/unsend messages (within 2 minutes, soft delete)
- 🌐 i18n — auto-detects browser language (en-GB, ja-JP), manual override
- 🌙 Dark mode (follows system preference)
- ♿ Accessible — keyboard navigation, ARIA labels, contrast

## Quick Start (Local Development)

### Prerequisites
- Node.js 18+
- npm

### 1. Clone & install

```bash
git clone <your-repo-url> glimpse-pchat
cd glimpse-pchat

# Install server dependencies
cd server
cp .env.example .env
npm install

# Install client dependencies
cd ../client
npm install
```

### 2. Set up database

```bash
cd server
npx prisma migrate dev --name init
```

This uses SQLite locally (no external database required).

### 3. Start dev servers

In two separate terminals:

```bash
# Terminal 1 — Backend (port 3000)
cd server
npm run dev

# Terminal 2 — Frontend (port 5173)
cd client
npm run dev
```

Open http://localhost:5173

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | Database connection string | `file:./dev.db` (SQLite) |
| `JWT_SECRET` | Secret for signing JWTs | (required) |
| `CLIENT_ORIGIN` | Frontend URL for CORS | `http://localhost:5173` |
| `NODE_ENV` | `development` or `production` | `development` |
| `PORT` | Server port | `3000` |

## Deploying to Render

### 1. Create services

1. **PostgreSQL Database** — Create a PostgreSQL instance on Render
2. **Web Service** — Connect your GitHub repo

### 2. Web Service settings

| Setting | Value |
|---|---|
| **Root Directory** | `server` |
| **Build Command** | `npm run build` |
| **Start Command** | `npm start` |

### 3. Environment variables (on Render)

```
DATABASE_URL=<internal postgres URL from Render>
JWT_SECRET=<generate a strong random secret>
CLIENT_ORIGIN=https://<your-service>.onrender.com
NODE_ENV=production
```

> **Note:** For production PostgreSQL, update the Prisma schema `provider` from `"sqlite"` to `"postgresql"` and re-generate.

### 4. Deploy

Push to GitHub → Render auto-deploys.

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Register with email, password, displayName |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Get current user |
| GET | `/api/users/search?q=` | Search users by display name |
| POST | `/api/connections/request` | Send connection request |
| POST | `/api/connections/respond` | Accept/reject request |
| GET | `/api/connections` | List connections |
| GET | `/api/connections/pending` | List pending requests |
| GET | `/api/conversations` | List conversations |
| POST | `/api/conversations` | Create/open 1:1 conversation |
| GET | `/api/conversations/:id/messages` | Get messages (cursor pagination) |
| POST | `/api/messages` | Send message |
| PATCH | `/api/messages/:id` | Edit message |
| POST | `/api/messages/:id/undo` | Undo send |

## WebSocket Events

| Direction | Event | Purpose |
|---|---|---|
| Server → Client | `message:new` | New message in conversation |
| Server → Client | `message:updated` | Message edited or undone |
| Server → Client | `conversation:updated` | Conversation list update |
| Server → Client | `connection:request` | New connection request |
| Server → Client | `connection:response` | Connection accepted/rejected |

## Licence

ISC
