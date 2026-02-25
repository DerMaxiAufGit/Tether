---
status: resolved
trigger: "After changing password and re-logging in, user is redirected to /change-password instead of /"
created: 2026-02-25T00:00:00Z
updated: 2026-02-25T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - ProtectedRoute saves /change-password as "from" state, then PublicRoute restores it after login
test: Code trace through the redirect chain
expecting: The "from" state carries /change-password through the logout->login cycle
next_action: Report root cause

## Symptoms

expected: After changing password, logging out, and logging back in, user should arrive at "/" (home)
actual: User is redirected back to /change-password after re-logging in
errors: none (behavioral bug, no errors)
reproduction: 1) Log in. 2) Go to /change-password. 3) Change password successfully. 4) Get redirected to /login. 5) Log in with new password. 6) End up at /change-password instead of /
started: Since auth routing was implemented

## Eliminated

(none needed - root cause identified on first hypothesis)

## Evidence

- timestamp: 2026-02-25T00:01:00Z
  checked: ProtectedRoute in App.tsx (line 38-51)
  found: When unauthenticated user hits a protected route, it saves `location.pathname` as `state.from` and redirects to /login
  implication: When logout() fires while on /change-password, ProtectedRoute saves from="/change-password"

- timestamp: 2026-02-25T00:02:00Z
  checked: PublicRoute in App.tsx (line 20-35)
  found: When authenticated user hits /login, it reads `location.state.from` and redirects there (default "/")
  implication: After re-login, PublicRoute sends user to whatever "from" was saved

- timestamp: 2026-02-25T00:03:00Z
  checked: ChangePasswordPage.tsx handleSubmit (lines 109-114)
  found: After success, calls `await logout()` THEN `navigate("/login", { replace: true, state: { message: "..." } })`
  implication: The navigate() call sets state with only `message`, no `from` - but this is overridden

- timestamp: 2026-02-25T00:04:00Z
  checked: useAuth.tsx logout() (lines 105-114)
  found: logout() calls `navigate("/login")` with NO state
  implication: logout() navigates to /login FIRST (no state), then ChangePasswordPage's navigate also fires

- timestamp: 2026-02-25T00:05:00Z
  checked: Full redirect chain analysis
  found: |
    The REAL issue is a race between two navigations, but the critical path is:
    1. User is on /change-password (a ProtectedRoute)
    2. logout() clears auth state -> setState({ isAuthenticated: false })
    3. React re-renders ProtectedRoute while still on /change-password
    4. ProtectedRoute sees !isAuthenticated, saves state={{ from: "/change-password" }} and redirects to /login
    5. This happens BEFORE either navigate() call executes (React state update -> re-render -> guard fires)
    6. User lands on /login with state.from = "/change-password"
    7. User logs in, LoginPage calls login() which sets isAuthenticated = true
    8. React re-renders PublicRoute wrapping /login
    9. PublicRoute sees isAuthenticated, reads state.from = "/change-password", redirects there
    10. User lands on /change-password instead of /
  implication: ROOT CAUSE CONFIRMED

## Resolution

root_cause: |
  When logout() is called from ChangePasswordPage, it clears auth state (isAuthenticated=false).
  This triggers a React re-render while the user is still on the /change-password route.
  The ProtectedRoute guard (App.tsx line 46-47) fires, sees the user is unauthenticated,
  and saves `state={{ from: location.pathname }}` which is "/change-password", then
  redirects to /login. When the user subsequently logs in, the PublicRoute guard
  (App.tsx line 30) reads this saved `from` value and redirects to "/change-password"
  instead of "/".

  The two navigate() calls in ChangePasswordPage.handleSubmit and useAuth.logout()
  are irrelevant - the ProtectedRoute guard fires synchronously on state change,
  before any imperative navigation executes.

fix: |
  Two complementary fixes needed:

  FIX 1 (Primary): In ChangePasswordPage.tsx, navigate to /login BEFORE calling logout().
  Use navigate("/login", { replace: true, state: { message: "..." } }) first to leave the
  ProtectedRoute, then call logout() to clear state. This way the ProtectedRoute guard
  never fires because the user is already on /login (a PublicRoute) when auth state clears.

  FIX 2 (Belt-and-suspenders): In useAuth.tsx logout(), remove the navigate("/login") call.
  The caller should control where to navigate after logout. Having logout() navigate
  creates a race with the caller's own navigation.

  FIX 3 (Alternative simpler approach): In LoginPage.tsx line 177, the navigate already
  hardcodes "/". But the real problem is the PublicRoute guard. The simplest fix is to
  make ChangePasswordPage navigate away BEFORE clearing auth state.

verification: Code trace confirms the fix breaks the redirect chain
files_changed:
  - apps/client/src/pages/auth/ChangePasswordPage.tsx
  - apps/client/src/hooks/useAuth.tsx
