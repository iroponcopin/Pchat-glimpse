# Messenger Clone

A real-time chat application built with React, Node.js, Express, Socket.io, and Prisma.

## Features

- Real-time messaging
- User authentication (Login/Register)
- Conversation list with last message preview
- Search users
- Optimistic UI updates
- Responsive design

## Tech Stack

- **Frontend**: React, Vite, TailwindCSS, Zustand, Axios
- **Backend**: Node.js, Express, Socket.io, Prisma, SQLite (Dev) / Postgres (Prod)

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm

### Installation

1.  Clone the repository.
2.  Install dependencies for both client and server.

```bash
# Backend
cd server
npm install
npx prisma generate
npx prisma migrate dev --name init

# Frontend
cd ../client
npm install
```

### Running Locally

1.  Start the backend server.

```bash
cd server
npm run dev
```

2.  Start the frontend development server.

```bash
cd client
npm run dev
```

3.  Open `http://localhost:5173` in your browser.

## Deployment on Render

1.  Create a new Web Service on Render.
2.  Connect your GitHub repository.
3.  Select `server` as the Root Directory.
4.  Set the Build Command to: `npm install && npx prisma generate`.
5.  Set the Start Command to: `node src/index.js`.
6.  Add Environment Variables:
    -   `DATABASE_URL`: (Your Postgres connection string)
    -   `JWT_SECRET`: (A secure random string)
    -   `CLIENT_ORIGIN`: (The URL of your frontend, e.g., https://your-app-name.onrender.com)
    -   `NODE_ENV`: `production`

Note: For the frontend to be served by the backend in production, you might need to build the frontend and serve static files from express, OR deploy frontend separately (Static Site) and backend separately (Web Service).
The current setup assumes a monorepo where you might want to deploy them separately or serve the client build from the server.

### Serving Client from Server (Recommended for simple deployment)

1.  Update `server/package.json` scripts to build client:
    `"build": "npm install && npx prisma generate && cd ../client && npm install && npm run build"`
2.  Update `server/src/index.js` to serve static files from `../client/dist`.

## License

MIT
