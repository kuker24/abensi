# SIAB2 — public architecture

This is the recruiter-facing view of SIAB2 (school-facing product name: **e-Hadir**). It describes only what is already visible in the public README. It does not document production hosts, keys, or private operator runbooks.

## What it is

An academic and attendance system used at MAN 1 Rokan Hulu. Teachers and staff record presence at the gate and in class. An official Android reader scans student/teacher QR credentials. A worker reconciles attendance state so the dashboard stays consistent.

## Stack

- NestJS API + Prisma + PostgreSQL
- React (Vite) web app
- Redis + reconciliation worker
- Nginx + Docker Compose
- Official Android QR reader

## Attendance flow

```text
QR credential (student / teacher)
        │
        ▼
Official Android reader
        │
        ▼
Signed request (device + nonce + signature + credential)
        │
        ▼
API validates the reader and the credential
        │
        ▼
Attendance policy
        │
        ▼
Audit / gate log / reconciliation
```

## Roles (high level)

| Role | What they do in the UI |
| --- | --- |
| Admin / TU | Daily command center, devices, school data, reports |
| Teacher | Start class, mark presence, request leave |
| Student | See their own attendance (not shown in the public screenshots) |

## Security (high level only)

- Official reader path is signed. A nonce is required so a captured request cannot be replayed casually.
- Readers are treated as devices that must be known to the school, not as anonymous scanners.
- Role-based access separates admin, teacher, and student work.
- Attendance writes are audited. A worker reconciles status instead of trusting a single scan event.

This file does **not** add endpoints, key formats, or rollout steps beyond the public README.

## Visual proof

UI walkthrough stills (test accounts, no student records):

- [Login / role picker](screenshots/login.png)
- [Admin dashboard](screenshots/dashboard.png)
- [Teacher dashboard](screenshots/teacher-dashboard.png)

These are UI stills from a test environment, not a live production recording.
