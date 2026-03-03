---
phase: 01-foundation
plan: 07
subsystem: ui
tags: [auth, registration, login, recovery-key, password-change, jwt, dark-theme]

requires:
  - phase: 01-03
    provides: crypto module with register/loginDecrypt/changePassword functions
  - phase: 01-04
    provides: server auth API endpoints (register, login, refresh, logout, change-password)
  - phase: 01-05
    provides: Socket.IO setup in server index.ts

provides:
  - AuthLayout with split dark theme (branding left, form right)
  - RegisterPage with password strength meter and key derivation progress
  - RecoveryKeyPage with forced acknowledgment flow
  - LoginPage with two-step challenge (salt retrieval, key derivation, auth)
  - ChangePasswordPage with re-encryption progress
  - WelcomePage placeholder
  - API wrapper (api.ts) with automatic JWT refresh on 401
  - useAuth hook with AuthProvider context
  - Server challenge endpoint (POST /api/auth/challenge) with fake salt for non-existent users
  - Server me endpoint (GET /api/auth/me, GET /api/auth/me/keys)

affects: [02-servers-and-channels, 03-e2ee-text-messaging]

tech-stack:
  added: [zxcvbn-ts, react-router-dom]
  patterns: [split-auth-layout, two-step-challenge-login, jwt-auto-refresh]

one_liner: "Complete auth UI — registration, login, password change, recovery key, and JWT auto-refresh"
---

# Summary

Implemented the complete authentication UI for Tether. All auth pages use a split dark layout with electric blue/cyan branding. Registration includes password strength meter (zxcvbn-ts), real-time key derivation progress, and a forced recovery key acknowledgment step. Login uses a two-step challenge flow to avoid leaking email existence. Password change re-encrypts all keys with the new password. The API wrapper handles automatic JWT refresh on 401 responses.

## What was built
- `AuthLayout.tsx` — split layout with responsive mobile fallback
- `RegisterPage.tsx` — form with inline validation, crypto progress, recovery key redirect
- `LoginPage.tsx` — two-step challenge + key derivation + auth
- `ChangePasswordPage.tsx` — re-encryption with progress
- `RecoveryKeyPage.tsx` — one-time display with forced copy acknowledgment
- `WelcomePage.tsx` — temporary landing page
- `api.ts` — fetch wrapper with auto-refresh
- `useAuth.tsx` — auth context provider
- `challenge.ts` — public salt endpoint with fake salt for non-existent users
- `me.ts` — protected user info and key bundle endpoints

## Status: COMPLETE
All auth flows functional. Verified via manual testing.
