# StaffSync server setup

The server stores accounts, employees, attendance, leave requests, payroll,
announcements, training programs, and notifications in MongoDB. Existing Atlas
credentials remain in the ignored `server/.env` file.

## Required environment variables

Add these values to `server/.env` without committing the file:

```env
JWT_SECRET=<a unique random value of at least 32 characters>
HR_BOOTSTRAP_KEY=<a different unique random value of at least 32 characters>
```

Keep the existing `MONGODB_URI` and `PORT`. The initial HR account is created
from the login screen using `HR_BOOTSTRAP_KEY`; the key can only be used while
the database has no user accounts. HR users create employee and manager
accounts from the Employees section. Initial account passwords must be at least
12 characters.

Use separate, randomly generated values for each secret. In PowerShell, one
way to generate a secret without displaying or storing it in this repository is:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

## Start locally

Run these commands in separate terminals:

```powershell
cd server
npm run dev
```

```powershell
cd client
npm run dev
```

The Vite development server proxies `/api` requests to `http://127.0.0.1:5000`.
For another frontend origin, set `CLIENT_ORIGIN` to a comma-separated allowlist
of exact origins. Production should serve the frontend and API on the same site
so the HttpOnly, SameSite session cookie is sent with requests.

## Access and data notes

- Passwords are stored as bcrypt hashes. JWTs are held in an HttpOnly,
  SameSite=Strict cookie; protected API handlers also enforce role and record
  scope.
- HR bootstrap is one-time and gated by `HR_BOOTSTRAP_KEY`. HR can add HR,
  Manager, and Employee accounts; Managers are scoped to their department.
- Employee deactivation is a soft delete; it disables the account but keeps
  attendance and leave history.
- Leave balances and position requisitions are not represented in the existing
  data model, so the UI does not invent balances or open-position totals.
- Existing browser-local leave/payroll data is not automatically copied to
  MongoDB because it has no verified employee account association. Existing
  dashboard overview and company settings remain browser-local.

## Checks

Run backend authorization and model tests with `npm test` from `server`, and
the frontend checks with `npm run build` and `npm run lint` from `client`.
