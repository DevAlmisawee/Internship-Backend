# InternIQ – Internship Management System (Backend)

A complete Node.js/Express/MongoDB backend for the InternIQ Internship Management System, built to pair with a React frontend.

## Tech Stack

| Concern | Choice |
|---|---|
| Runtime | Node.js |
| Framework | Express.js |
| Database | MongoDB (Mongoose ODM) |
| Auth | JWT + bcrypt |
| File uploads | Multer → Cloudinary |
| Validation | express-validator |
| Email | Nodemailer |
| Security | Helmet, CORS, express-rate-limit |
| Logging | Morgan |
| Docs | Swagger (swagger-ui-express + swagger-jsdoc) |

## Getting Started

```bash
cd backend
npm install
cp .env.example .env   # then fill in your real values
npm run dev             # nodemon, auto-restarts on changes
# or
npm start                # plain node
```

The API will be available at `http://localhost:5000`, with interactive docs at `http://localhost:5000/api-docs` and a health check at `http://localhost:5000/health`.

### Required environment variables

See `.env.example` for the full list. At minimum, for local dev you need:

- `MONGO_URI` — a local MongoDB instance (`mongodb://localhost:27017/interniq`) or a MongoDB Atlas connection string
- `JWT_SECRET` — any long random string
- `CLIENT_URL` — your React app's URL (used for CORS and password-reset email links)

Email (`EMAIL_*`) and Cloudinary (`CLOUDINARY_*`) variables are only needed once you actually trigger those features (password reset emails, CV/logo uploads). The app will boot without them, but those specific calls will fail or log an error until configured.

## Project Structure

```
backend/
├── src/
│   ├── config/        # DB, Cloudinary, Swagger config
│   ├── controllers/    # Route handler logic
│   ├── middleware/      # auth, admin, upload, validation, error handling
│   ├── models/          # Mongoose schemas
│   ├── routes/          # Express routers
│   ├── services/        # email + notification helpers
│   ├── utils/            # JWT helper, validation chains
│   ├── uploads/          # Local temp storage before Cloudinary upload
│   ├── app.js            # Express app + middleware wiring
│   └── server.js         # Entry point — connects DB, starts server
├── .env.example
└── package.json
```

## Data Model

- **User** — base account (name, email, password, role, phone, profilePicture). Roles: `admin`, `student`, `company`, `supervisor`.
- **Student** — extends a User; matric number, department, level, CGPA, skills, CV, bio, saved internships, assigned supervisor.
- **Company** — extends a User; company name, industry, address, website, description, logo, `approved` flag (admin must approve before the company can post internships).
- **Internship** — title, description, companyId, location, remote flag, duration, stipend, requirements, deadline, category, status (`open`/`closed`).
- **Application** — studentId, internshipId, companyId, status (`Pending` → `Reviewed` → `Accepted`/`Rejected`), cover letter, resume.
- **Supervisor** — extends a User; department, office, phone, list of assigned students.
- **Evaluation** — *(added beyond the original spec's DB list to support the documented supervisor capability of "evaluate students and submit reports")* — supervisorId, studentId, score, comments, reportUrl.
- **Notification** — userId, title, message, read flag.

A registered `User` automatically gets a matching `Student`/`Company`/`Supervisor` profile document created at registration time (admins don't need one).

## Authentication & Authorization

- JWT is issued on register/login and returned both in the JSON response (`data.token`) and as an `httpOnly` cookie, so the React frontend can use either a stored token (`Authorization: Bearer <token>`) or rely on the cookie.
- `protect` middleware verifies the token and attaches `req.user`.
- `authorize('role1', 'role2', ...)` middleware restricts a route to specific roles.
- Ownership checks (e.g. a company can only edit *its own* internships) are enforced inside controllers, not just by role.

## API Endpoints

### Auth — `/api/auth`
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/register` | Public | Creates User + role profile |
| POST | `/login` | Public | Returns JWT + sets cookie |
| POST | `/logout` | Public | Clears auth cookie |
| POST | `/forgot-password` | Public | Emails a reset link |
| POST | `/reset-password` | Public | Body: `{ token, password }` |
| PUT | `/change-password` | Authenticated | Body: `{ oldPassword, newPassword }` |
| GET | `/me` | Authenticated | Returns current user |

### Students — `/api/students` (role: student)
| Method | Path | Notes |
|---|---|---|
| GET | `/profile` | |
| PUT | `/profile` | department, level, cgpa, skills, bio, matricNumber |
| POST | `/cv` | multipart field `cv` |
| GET | `/applications` | own applications |
| GET | `/saved` | saved internships |
| POST | `/saved/:internshipId` | toggles save/unsave |
| GET | `/dashboard` | submitted/accepted/rejected/pending counts |

### Companies — `/api/company`
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/` | Authenticated | Approved companies only, unless admin |
| GET | `/:id` | Authenticated | |
| POST | `/` | company | Create/update own profile |
| POST | `/logo` | company | multipart field `logo` |
| GET | `/dashboard/stats` | company | posted/received/accepted/rejected counts |
| PUT | `/:id` | company (own) or admin | |
| DELETE | `/:id` | admin | Cascades: deletes the company's internships too |

### Internships — `/api/internships`
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/` | Authenticated | search, filter, sort, pagination — see below |
| GET | `/:id` | Authenticated | |
| POST | `/` | company (must be approved) | |
| PUT | `/:id` | company (own) or admin | |
| DELETE | `/:id` | company (own) or admin | |

**Query params on `GET /api/internships`:**
- `search` — full-text search across title/description/category
- `location`, `category`, `company` — substring filters
- `paid=true|false` — stipend > 0 or = 0
- `remote=true|false`
- `sort=newest|oldest|deadline|company|location`
- `page`, `limit` — pagination (default 10/page, max 100)

### Applications — `/api/applications` (authenticated)
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/` | student | multipart field `resume` optional (falls back to stored CV) |
| GET | `/` | scoped by role | student → own; company → theirs; admin → all. Filters: `?status=`, `?internshipId=` |
| GET | `/:id` | any authenticated | |
| PUT | `/:id` | company (own) or admin | Body: `{ status }`, one of Pending/Reviewed/Accepted/Rejected — triggers email + notification |
| DELETE | `/:id` | student (own) or admin | Withdraws application |

### Supervisors — `/api/supervisors` (role: supervisor)
| Method | Path | Notes |
|---|---|---|
| GET | `/profile` | |
| PUT | `/profile` | |
| GET | `/students` | assigned students |
| POST | `/evaluations` | Body: `{ studentId, score, comments, reportUrl }` |
| GET | `/evaluations` | own submitted evaluations |

### Admin — `/api/admin` (role: admin)
| Method | Path | Notes |
|---|---|---|
| GET | `/dashboard` | platform-wide stats |
| GET | `/users` | `?role=`, `?page=`, `?limit=` |
| DELETE | `/users/:id` | cascades role-profile + company internships |
| PUT | `/users/:id/deactivate` | soft-disable instead of deleting |
| PUT | `/company/:id/approve` | emails + notifies the company |
| PUT | `/supervisors/:supervisorId/assign/:studentId` | bidirectional assignment |

### Notifications — `/api/notifications` (authenticated)
*(Added beyond the original endpoint list so the Notification model is actually reachable from the frontend.)*

| Method | Path | Notes |
|---|---|---|
| GET | `/` | own notifications + unread count |
| PUT | `/:id/read` | |
| PUT | `/read-all` | |
| DELETE | `/:id` | |

## Response Format

All endpoints return a consistent shape:

```json
{ "success": true, "message": "Login successful", "data": { } }
```
```json
{ "success": false, "message": "Email already exists" }
```

Validation errors include a field-level breakdown:
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [{ "field": "email", "message": "A valid email is required" }]
}
```

## Security Measures Implemented

- Passwords hashed with bcrypt (never returned in API responses)
- JWT auth with configurable expiry
- Helmet for secure HTTP headers
- CORS restricted to `CLIENT_URL`
- General rate limiting on all `/api` routes + a stricter limiter on auth endpoints
- express-validator on all write endpoints
- Centralized error handler that normalizes Mongoose/Multer/JWT errors into safe JSON (stack traces only included when `NODE_ENV=development`)

## Notes on Two Implementation Decisions

1. **Evaluation model** — the original spec's database design section didn't list an "Evaluation" collection, but the Supervisor role description says supervisors "evaluate students" and "submit reports." I added a minimal `Evaluation` model + `/api/supervisors/evaluations` endpoints to make that capability actually functional rather than just documented.
2. **Notification endpoints** — the spec defines a `Notification` collection and lists example notification triggers, but no REST endpoints for reading/managing them. I added a small `/api/notifications` router so the React frontend has a way to display and clear them.

## Not Yet Implemented (flagged as "Optional Advanced Features" in the spec)

Socket.IO real-time notifications, OTP/2FA, refresh tokens, AI-based internship recommendations, PDF report generation, QR certificate verification, Redis caching, Docker, and CI/CD were listed as optional stretch goals in the original spec and are not included here. The architecture (especially the `services/` layer and consistent controller pattern) should make each of these straightforward to add later if you want help with any of them.

## What I Could Not Verify

This sandbox has no outbound network access, so I could not run `npm install` against the real npm registry or spin up a live MongoDB instance to test the running server end-to-end here. Every file was verified with `node --check` (syntax) and a dependency-resolution pass (every internal `require()` points to a real file, every route import matches an actual controller export). Once you run `npm install` and start MongoDB locally (or point `MONGO_URI` at Atlas), `npm run dev` should boot cleanly — but please flag anything that doesn't behave as expected so I can fix it.
