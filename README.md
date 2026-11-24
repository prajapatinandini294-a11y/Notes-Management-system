# NoteSpace — Notes Management System

A full-stack notes app: **React + Vite** frontend, **Express + MongoDB** backend, **JWT** auth.

## Features
- Register / login (JWT, bcrypt-hashed passwords)
- Create, edit, delete notes — **private** or **public**
- **Tags** (`work, ideas, study`) with click-to-filter chips
- **Pin** notes to the top
- Favorites, Archive, Trash (restore or delete permanently)
- **Server-side search** (title, text, tags) with debounce, plus **sorting** (newest / oldest / A–Z / Z–A)
- **Dark mode** (remembers your choice, follows system theme by default)
- Accurate sidebar counts and dashboard stats

## Setup

### Backend
```bash
cd backend
cp .env.example .env     # then fill in MONGO_URI and JWT_SECRET
npm install
npm run dev              # http://localhost:5000
```

### Frontend
```bash
cd frontend
npm install
npm run dev              # http://localhost:5173
```

## API (all `/api/notes/*` routes need `Authorization: Bearer <token>`)

| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login, returns token |
| GET | `/api/notes?view=&q=&tag=&sort=` | List notes. `view`: all, private, public, favorites, archived, trash. `sort`: newest, oldest, az, za |
| GET | `/api/notes/stats` | Counts for sidebar / dashboard |
| GET | `/api/notes/tags?view=` | Tags used in a view |
| POST | `/api/notes` | Create (`title`, `description`, `visibility`, `tags`) |
| PUT | `/api/notes/:id` | Update |
| PATCH | `/api/notes/:id/favorite` · `/pin` · `/archive` · `/restore` | Toggle / restore |
| DELETE | `/api/notes/:id` | Move to trash |
| DELETE | `/api/notes/:id/permanent` | Delete forever (from trash) |

## Security notes
- Never commit `.env` (it is in `.gitignore`). Use a long random `JWT_SECRET`.
- Public notes only expose the author's **name**, never their email.
