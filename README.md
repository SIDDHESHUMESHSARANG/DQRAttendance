# DQRAttendance

DQRAttendance is a web-based attendance management system for educational
institutions. Administrators manage people, classrooms, lectures, and reports;
professors run attendance sessions; and students check in using a short-lived
QR code and location verification.

This README is also intended as a project handoff. It describes the current
implementation so a developer or AI assistant can understand the system before
writing a project report, changing code, or proposing new features. Treat the
repository as the source of truth when details here and implementation differ.

## Contents

- [Project at a glance](#project-at-a-glance)
- [Roles and capabilities](#roles-and-capabilities)
- [Attendance workflow and rules](#attendance-workflow-and-rules)
- [Architecture and repository layout](#architecture-and-repository-layout)
- [Technology stack](#technology-stack)
- [Local development setup](#local-development-setup)
- [Configuration](#configuration)
- [API overview](#api-overview)
- [Data model overview](#data-model-overview)
- [Validation and testing](#validation-and-testing)
- [Current implementation notes](#current-implementation-notes)
- [Working with Claude or another coding assistant](#working-with-claude-or-another-coding-assistant)

## Project at a glance

| Attribute | Description |
| --- | --- |
| Project name | DQRAttendance |
| Project type | Full-stack web application |
| Main purpose | Manage class attendance and provide QR-based student check-in |
| Frontend | React single-page application built with Vite |
| Backend | Node.js ES modules, Express 5 REST API |
| Database | MongoDB accessed through Mongoose |
| User roles | Admin, professor, student |
| Local frontend URL | `http://localhost:5173` |
| Local backend URL | `http://localhost:3000` |
| API prefix | `/api` |

## Roles and capabilities

### Admin

- Register and sign in; registration is confirmed using an email OTP.
- Create, list, update, delete, and bulk-import student records.
- Create, list, search, update, deactivate/reactivate, and bulk-import professor
  records.
- Create and update classrooms with a name, building, coordinates, and radius.
- Create, update, and cancel lectures; view lecture and classroom information.
- View dashboard statistics, attendance overviews, attendance by date, and an
  individual student's attendance history.
- Review out-of-range attendance records and approve or reject them.
- Reset a student's trusted-device association.
- View students below the low-attendance threshold and send WhatsApp reminders.

Student and professor bulk imports accept CSV/Excel files in the backend and
are limited to 5 MB per upload. Admin APIs are protected by authentication and
role authorization.

### Professor

- Activate a pre-created professor account through email OTP and sign in.
- View lectures and run only lectures assigned to their account.
- Start an attendance session after granting browser location access.
- Display a rotating QR code while the lecture is active.
- Stop an active lecture to mark it completed.

### Student

- Activate an admin-created student account using an email OTP and sign in.
- View their attendance dashboard and attendance summary.
- Use a camera to read a QR code where the browser supports it, or paste the QR
  payload into the check-in form.
- Grant location access to submit attendance.
- Sign out and have the active server token revoked.

## Attendance workflow and rules

1. An admin creates a lecture and assigns its professor, class, date, time, and
   classroom information.
2. The assigned professor starts the lecture. The browser captures the
   professor's current coordinates, which are saved with the lecture.
3. While the lecture is ongoing, the professor portal requests QR tokens. Each
   token is random, stored in the database as a SHA-256 hash, and expires after
   **15 seconds**.
4. The student scans or pastes the QR payload. The frontend first asks the API
   to validate it, then requests the student's current location and submits the
   token and coordinates.
5. The backend checks that the student is activated, the QR token is current,
   the lecture is ongoing, the student belongs to the lecture's assigned class,
   and an attendance record does not already exist for that student and
   lecture.
6. The attendance distance is measured from the student's submitted location
   to the professor's coordinates captured when the lecture started. The
   allowed lecture radius is currently set to **30 metres** when a professor
   starts a lecture.
7. An in-range record is stored as `present`. An out-of-range record is stored
   as `flagged` and awaits admin review. If configured, the backend also tries
   to send an out-of-range WhatsApp alert to the admin.
8. Admins can approve or reject flagged records. Approved flagged attendance
   counts as attended in live attendance summaries; pending or rejected
   flagged records do not.
9. Low-attendance summaries consider completed lectures assigned to the
   student's class. The low-attendance threshold is **below 75%**.

The classroom record must exist and be active for check-in. Although classroom
records store their own coordinates and radius, the current scan verification
compares the student location against the professor location captured at
lecture start; it does not calculate distance from the classroom coordinates.

## Architecture and repository layout

```text
DQRAttendance/
├── Backend/
│   ├── config/                 MongoDB connection
│   ├── controllers/            API behavior and business logic
│   ├── middleware/             JWT authentication and role checks
│   ├── models/                 Mongoose schemas and indexes
│   ├── routes/                 Express route definitions
│   ├── utils/                  Email and WhatsApp integrations
│   ├── server.js               Express app, CORS, API mounting, startup
│   └── README.md               WhatsApp setup notes
└── Frontend/
    ├── public/                 Static assets
    ├── src/
    │   ├── components/         Admin dashboard and management screens
    │   ├── services/           API client helpers and API URL configuration
    │   ├── App.jsx              Role selection, authentication, admin shell
    │   ├── Professor.jsx       Professor lecture and QR workflow
    │   └── StudentPortal.jsx   Student dashboard and check-in workflow
    └── vite.config.js
```

The frontend and backend are separate npm applications with separate
`package.json` files. There is no root npm workspace script. The frontend calls
the backend REST API using `VITE_API_URL` (default:
`http://localhost:3000/api`).

## Technology stack

### Frontend

- React 19
- Vite 8
- JavaScript with JSX
- `qrcode.react` for rendering QR codes
- CSS stylesheets colocated with the application and components
- ESLint for linting

### Backend

- Node.js with ES modules
- Express 5
- MongoDB and Mongoose
- JWT-based authentication and role authorization
- `bcrypt` / `bcryptjs` for password hashing
- Nodemailer for registration OTP email
- Twilio for WhatsApp notifications
- Multer and SheetJS (`xlsx`) for CSV/Excel imports

## Local development setup

### Prerequisites

- Node.js and npm versions compatible with the installed Vite 8 toolchain.
- A MongoDB database reachable from the backend.
- SMTP credentials for account-registration OTP email.
- Optional: Twilio WhatsApp credentials for attendance notifications.
- A browser with camera and geolocation support for the full student check-in
  flow. Browser permission and secure-context requirements apply.

### 1. Configure the backend

In a terminal:

```powershell
cd Backend
npm install
```

Create `Backend/.env` locally and set the variables listed in
[Configuration](#configuration). Do not commit this file or paste credentials
into a report or AI chat. Start the API:

```powershell
npm run dev
```

The backend listens on `http://localhost:3000` by default. A successful
database connection is required before the server starts. The health endpoint
is `GET http://localhost:3000/`.

### 2. Configure and start the frontend

In a second terminal:

```powershell
cd Frontend
npm install
npm run dev
```

Open the Vite URL printed in the terminal (normally
`http://localhost:5173`). The backend currently permits CORS requests from
`http://localhost:5173`; if the frontend is served from a different origin,
update the CORS configuration in `Backend/server.js`.

For a non-default backend API URL, set `VITE_API_URL` in the frontend
environment before starting or building. It should include the `/api` suffix,
for example:

```text
VITE_API_URL=http://localhost:3000/api
```

## Configuration

Set backend variables in `Backend/.env`. This table lists variable names and
purpose only; it intentionally contains no live values.

| Variable | Purpose |
| --- | --- |
| `PORT` | Backend port; defaults to `3000`. |
| `MONGO_URI` | MongoDB connection URI. Required for backend startup. |
| `JWT_SECRET` | Secret used to sign and verify authentication tokens. |
| `OTP_SECRET` | Secret used to hash/verify email registration OTPs. |
| `SMTP_HOST` | SMTP host; defaults in code to `smtp-relay.brevo.com`. |
| `SMTP_PORT` | SMTP port; defaults in code to `587`. |
| `SMTP_USER` | SMTP account username. |
| `SMTP_PASS` | SMTP account password or API key. |
| `MAIL_FROM` | Sender address used for OTP emails. |
| `ADMIN_WHATSAPP_TO` | Optional admin recipient for out-of-range scan alerts, in E.164 format. |
| `TWILIO_ACCOUNT_SID` | Twilio account identifier. |
| `TWILIO_AUTH_TOKEN` | Twilio authentication token. |
| `TWILIO_WHATSAPP_FROM` | WhatsApp-enabled Twilio sender, in E.164 format. |
| `TWILIO_WHATSAPP_MODE` | Set to `sandbox` to send free-form sandbox reminders; other values use the approved template flow. |
| `TWILIO_WHATSAPP_CONTENT_SID` | Approved Twilio WhatsApp Content Template SID for production reminders. |

The frontend uses `VITE_API_URL` to configure the API base path. Vite exposes
variables prefixed with `VITE_` to frontend code, so never put secrets in
frontend environment variables.

The backend sends registration OTPs by email. WhatsApp low-attendance
reminders require student phone numbers in E.164 format. The sandbox and
production template setup, including template content, is documented in
[`Backend/README.md`](./Backend/README.md).

## API overview

All API paths below are relative to `/api`. Unless marked **Public**, endpoints
require a bearer JWT and the listed role. Protected routes use
`Authorization: Bearer <token>`.

| Route | Access | Purpose |
| --- | --- | --- |
| `POST /admin/register` | Public | Request admin registration OTP. |
| `POST /admin/verify-otp` | Public | Verify admin OTP and complete registration. |
| `POST /admin/login` | Public | Admin sign-in. |
| `POST /admin/logout` | Admin | Revoke the current admin token. |
| `GET /admin/profile` | Admin | Read authenticated admin profile. |
| `/admin/students` | Admin | Create/list/update/delete student records. |
| `POST /admin/students/bulk-upload` | Admin | Import students from CSV/Excel. |
| `PATCH /admin/students/:id/reset-device` | Admin | Reset a student's trusted device. |
| `GET /admin/flagged-attendance` | Admin | List attendance awaiting review. |
| `PATCH /admin/attendance/:id/review` | Admin | Approve or reject a flagged record. |
| `GET /admin/attendance/overview` | Admin | Attendance overview. |
| `GET /admin/attendance/by-date` | Admin | Attendance for a requested date. |
| `GET /admin/students/:id/attendance` | Admin | Individual attendance history. |
| `GET /admin/dashboard/stats` | Admin | Dashboard statistics. |
| `GET /admin/students/low-attendance` | Admin | List students below the attendance threshold. |
| `POST /admin/students/:studentId/attendance-alert` | Admin | Send a low-attendance WhatsApp reminder. |
| `POST /professors/register` | Public | Request professor registration OTP. |
| `POST /professors/verify-otp` | Public | Verify professor OTP and activate account. |
| `POST /professors/login` | Public | Professor sign-in. |
| `/professors` | Admin | Create and list professors. |
| `GET /professors/search` | Admin | Search professors. |
| `PUT /professors/:id` | Admin | Update professor. |
| `PATCH /professors/:id/deactivate` | Admin | Deactivate professor. |
| `PATCH /professors/:id/reactivate` | Admin | Reactivate professor. |
| `POST /professors/bulk-upload` | Admin | Import professors from CSV/XLSX. |
| `GET /classrooms` | Admin | List classrooms. |
| `POST /classrooms` | Admin | Create a classroom. |
| `PATCH /classrooms/:id` | Admin | Update a classroom. |
| `GET /lectures` | Admin, professor | List lectures accessible to the caller. |
| `POST /lectures` | Admin | Create a lecture. |
| `PUT /lectures/:id` | Admin | Update a lecture. |
| `PATCH /lectures/:id/cancel` | Admin | Cancel a lecture. |
| `PATCH /lectures/:id/start` | Assigned professor | Start lecture and capture professor location. |
| `PATCH /lectures/:id/stop` | Assigned professor | Stop lecture and mark it completed. |
| `POST /lectures/:id/qr` | Assigned professor | Generate a short-lived QR token for an ongoing lecture. |
| `POST /student/register` | Public | Request student activation OTP for an existing student record. |
| `POST /student/verify-otp` | Public | Verify activation OTP and set a password. |
| `POST /student/login` | Public | Student sign-in and device validation. |
| `GET /student/dashboard` | Student | Read student dashboard and attendance data. |
| `POST /student/logout` | Student | Revoke the current student token. |
| `POST /student/device/register` | Student | Register trusted device. |
| `POST /student/attendance/validate-qr` | Student | Validate a QR token before check-in. |
| `POST /student/attendance/scan` | Student | Submit a QR check-in and location. |

Route-specific request and response shapes are defined in the route/controller
implementation. Inspect those files before relying on a request schema not
documented above.

## Data model overview

The main Mongoose models are:

- **Admin**: name, unique email, password hash, and admin role.
- **Professor**: name, unique email, password, subjects, assigned classes,
  registration state, and active state.
- **Student**: email, optional WhatsApp number, activation/password state,
  academic identity, trusted-device information, and attendance summary.
- **Classroom**: unique classroom/building pair, optional building name,
  coordinates, radius, and active state.
- **Lecture**: professor, subject, assigned class, classroom details, schedule,
  status, professor coordinates captured at start, and attendance radius.
- **Attendance**: student, lecture, classroom, dates, location/distance,
  `present` or `flagged` status, and admin verification state.
- **QRToken**: lecture, token hash, expiry, and use-state field. Expired token
  documents have a MongoDB TTL index.
- **RevokedToken**: JWT hash and expiry, used to invalidate logged-out tokens.
- **PendingAdminRegistration**, **PendingProfessorRegistration**, and
  **PendingStudentRegistration**: temporary registration data, hashed OTP,
  expiry, and attempt metadata.

Attendance has a unique compound index on student and lecture to prevent
duplicate attendance for the same lecture. Student email and class/roll number
are also protected by unique indexes.

## Validation and testing

Run frontend static checks and a production build from `Frontend/`:

```powershell
npm run lint
npm run build
```

The backend package currently defines `start` and `dev` scripts but does not
define a test or lint script. No automated test suite is documented in the
package scripts. For a meaningful end-to-end check, run the backend against a
development MongoDB database, configure email only if testing OTP delivery,
and exercise the three user flows in a browser. Use test accounts and test
data, not production student information.

## Current implementation notes

- Backend CORS allows only `http://localhost:5173` by default.
- The backend's `GET /` route is a simple availability response; it does not
  expose a database health/readiness check.
- The professor's captured location is the scan-distance reference. Classroom
  records are still required and must be active, but their stored coordinates
  are not currently used in the check-in distance calculation.
- The student portal's automatic camera scan depends on browser
  `BarcodeDetector` support. Pasting the QR payload is the implemented
  alternative.
- Browser camera and geolocation permissions are required for the standard
  in-person flow. These browser APIs generally require a secure context outside
  localhost.
- Authentication tokens and session details are stored in browser
  `localStorage`; account for this when evaluating client-side security or
  proposing a storage change.
- Attendance summaries used by low-attendance alerts are calculated from
  completed lectures and attendance records; do not assume the stored student
  summary is the sole source for every report.
- This repository snapshot does not include an explicit root workspace,
  deployment configuration, test runner, or API schema specification.

## Working with Claude or another coding assistant

Give the assistant this README together with access to the repository. Do not
include `Backend/.env`, credentials, production data, or other secrets in the
context. The README is a map, not a replacement for inspecting source code.

Suggested prompt:

> Read the root README and inspect the relevant source files before making
> claims or changes. Use the repository implementation as the source of truth,
> and clearly distinguish implemented behavior from proposed behavior. For a
> project report, cover the problem statement, objectives, users and roles,
> system architecture, technology stack, major workflows, data model, API
> surface, security/privacy considerations, limitations, and future
> improvements. Do not invent features, test results, deployment details, or
> performance claims. Never request, print, or expose `.env` values or
> credentials. If a detail is uncertain, identify it as unverified and point to
> the relevant code path.

### Useful source files

- Backend entry point and API mounts: [`Backend/server.js`](./Backend/server.js)
- API route definitions: [`Backend/routes/`](./Backend/routes/)
- Business logic: [`Backend/controllers/`](./Backend/controllers/)
- Authentication and role checks: [`Backend/middleware/authMiddleware.js`](./Backend/middleware/authMiddleware.js)
- Database schemas: [`Backend/models/`](./Backend/models/)
- Student attendance flow: [`Backend/controllers/studentController.js`](./Backend/controllers/studentController.js)
- QR generation/validation: [`Backend/controllers/qrController.js`](./Backend/controllers/qrController.js)
- Admin UI and role selection: [`Frontend/src/App.jsx`](./Frontend/src/App.jsx)
- Professor UI: [`Frontend/src/Professor.jsx`](./Frontend/src/Professor.jsx)
- Student UI: [`Frontend/src/StudentPortal.jsx`](./Frontend/src/StudentPortal.jsx)
- API base URL setting: [`Frontend/src/services/apiConfig.js`](./Frontend/src/services/apiConfig.js)
