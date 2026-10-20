# DQRSmartAttendance

React and Vite frontend for DQRSmartAttendance, a QR-based attendance system.

## Run locally

1. Start the backend API on port `3000` (or set its `PORT`).
2. In this folder, install dependencies with `npm install`.
3. Start the frontend with `npm run dev`.

The client uses `http://localhost:3000/api` by default. To use another API
origin, set `VITE_API_URL` to the API base path, including `/api`, before
starting or building the frontend.

For the deployed API, configure the Vercel project environment variable
`VITE_API_URL` as `https://dqrattendance.onrender.com/api`, then redeploy the
frontend. The Render backend must allow the Vercel site's exact origin through
its `FRONTEND_URL` environment setting; the main
`https://dqr-attendance.vercel.app` origin is allowed by default.

## Portals

- **Admin:** Manage students and professors, create classrooms and schedule
  lectures, view attendance reports, review flagged scans, reset trusted
  student devices, and send low-attendance WhatsApp reminders.
- **Professor:** View assigned lectures, start and stop attendance sessions,
  and display the live QR code.
- **Student:** Activate an admin-created account with an email OTP, sign in on
  a trusted device, review attendance, and scan an active QR code. Camera and
  location access are required for in-person QR check-in; the QR payload can
  also be pasted into the check-in form.

Run `npm run lint` and `npm run build` to validate the frontend.
