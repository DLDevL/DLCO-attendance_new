# Attendance Register

A web app for teachers to take class attendance and for students to track their own — with secure sign-in, reports and a light/dark theme.

**Live site:** https://dlco-attendance-new.vercel.app

---

## Features

**For teachers**
- **Overview dashboard** — today's attendance, weekly chart, monthly calendar and quick stats
- **Attendance** — mark Present / Absent / Late / Leave for a whole class in a few taps
- **Students & Classes** — add, search and manage the roster
- **Leave Requests** — set and track earned / casual leave balances
- **Reports** — attendance percentage per student, low-attendance alerts, PDF export

**For students**
- **My Attendance** — subject-wise percentages plus a *bunk calculator* (how many classes you can still miss and stay above 75%)
- **Timetable** — the one the teacher publishes for their section
- **Apply Leave** — requests go to the teacher's Leave Requests page; the approve / reject decision comes back to the student
- **Warnings** — low-attendance warnings sent from Reports appear on the student's dashboard and in notifications

**Accounts & security**
- Sign up with email — a **confirmation email must be clicked before the first sign-in**
- **Sign up with Google** — pick your role, then register in one step with no confirmation email (Google has already verified the address)
- **Continue with Google** — sign in to an existing account (Google always shows the account chooser)
- **Forgot password** — reset link by email, then choose a new password on the site
- Role-based access (teacher / student) checked on the server for every request
- Privacy Policy and Terms pages

**Interface**
- Light and dark theme (remembers your choice, follows your system by default)
- Works on phones, tablets and desktops
- Demo mode with generated data: add `?demo=teacher` or `?demo=student` to the URL

## Tech stack

| Part | Built with |
|---|---|
| Frontend | HTML, CSS and vanilla JavaScript (ES modules, no build step), Chart.js, Lucide icons |
| Backend | Node.js + Express 5 |
| Database & auth | Supabase (Postgres, email + Google sign-in) |
| Emails | Custom SMTP through Supabase |
| Hosting | Vercel |

## Project structure

```
dlco-attendance-main/
├── api/index.js                  # Vercel entry point → loads the Express app
├── vercel.json                   # routes /api, /assets, /privacy, /terms and the app
└── attendance-system/
    ├── backend/
    │   ├── index.js              # Express API: auth, classes, students, attendance, leaves, reports
    │   ├── supabase.js           # Supabase clients (reads keys from environment variables)
    │   └── .env.example          # the environment variables you need
    └── frontend/
        ├── index.html            # app shell
        ├── privacy.html, terms.html
        └── assets/
            ├── css/              # theme tokens, layout, login page
            └── js/               # router, pages, components, API + data layer
```

## Run it locally

You need [Node.js](https://nodejs.org) 18 or newer and a free [Supabase](https://supabase.com) project.

```bash
git clone https://github.com/DLDevL/DLCO-attendance_new.git
cd DLCO-attendance_new/dlco-attendance-main/attendance-system/backend
npm install
cp .env.example .env        # Windows: copy .env.example .env
```

Open `.env` and fill in your Supabase URL and keys (Supabase → **Project Settings → API Keys**).

Then open Supabase → **SQL Editor** and run `attendance-system/backend/schema-portal-link.sql` once. It creates the shared tables (subjects, timetable, leave requests, warnings) that link the teacher and student portals. Then start the server:

```bash
npm start
```

Open **http://localhost:3000**. To look around without an account, open http://localhost:3000/?demo=teacher.

### Supabase setup for sign-in
- **Authentication → Sign In / Providers → Email:** turn on **Confirm email**
- **Authentication → Emails → SMTP Settings:** add an SMTP sender so confirmation emails can be delivered
- **Authentication → URL Configuration:** set the Site URL and add your site (and `http://localhost:3000/**`) to Redirect URLs
- *(Optional)* **Sign In / Providers → Google:** add a Google OAuth Client ID and secret

## Deploying

The repo deploys to Vercel from `main`. Set the same variables as in `.env.example` under **Vercel → Project → Settings → Environment Variables**.

## Contributing

1. Create a branch: `git switch -c my-change`
2. Commit your work: `git add .` then `git commit -m "Describe the change"`
3. Push and open a pull request: `git push -u origin my-change`

## License

[MIT](LICENSE)
