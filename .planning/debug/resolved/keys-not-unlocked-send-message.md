---
status: resolved
trigger: "When sending a message, it always shows as 'Failed'. Frontend logs show: [sendMessage] mutation failed: Error: Keys not unlocked — call LOGIN_DECRYPT first at td.onmessage"
created: 2026-02-28T00:00:00Z
updated: 2026-02-28T01:00:00Z
symptoms_prefilled: true
---

## Current Focus

hypothesis: CONFIRMED — Two bugs: (1) CryptoUnlockPrompt was removed from ChannelView without replacing its function; (2) RegisterPage never called loginDecrypt, so _cachedKeys was never set after registration
test: Read git diff, traced crypto worker state through all auth paths
expecting: Fix by restoring CryptoUnlockPrompt via keysRestored state in useAuth, and adding loginDecrypt to RegisterPage
next_action: DONE

## Symptoms

expected: Messages should encrypt and send successfully after user is logged in
actual: Every message send attempt fails with "Failed" status
errors: `[sendMessage] mutation failed: Error: Keys not unlocked — call LOGIN_DECRYPT first at td.onmessage (index-BTnWUGLG.js:60:68261)`
reproduction: Log in and try to send any message in any channel
started: Unknown - regression from recent changes (commit f9368aa and subsequent uncommitted work)

## Eliminated

- hypothesis: loginDecrypt is not called in LoginPage
  evidence: LoginPage.tsx lines 163-173 show loginDecrypt IS awaited before calling login()
  timestamp: 2026-02-28

- hypothesis: Worker instance mismatch (different worker for login vs encrypt)
  evidence: crypto.ts uses a single module-level `const worker = new Worker(...)` singleton — same instance for all calls
  timestamp: 2026-02-28

- hypothesis: Type mismatch in LoginResponse prevents loginDecrypt from running
  evidence: LoginPage correctly types and awaits loginDecrypt regardless of type shape
  timestamp: 2026-02-28

## Evidence

- timestamp: 2026-02-28
  checked: git diff HEAD -- apps/client/src/pages/server/ChannelView.tsx
  found: CryptoUnlockPrompt import, cryptoUnlocked state, probe useEffect, and disabled={!isUnlocked} on MessageInput were ALL removed
  implication: When _cachedKeys is null (page reload with no IndexedDB keys, or first registration), there is no fallback — user can type and send but encryption fails

- timestamp: 2026-02-28
  checked: crypto.worker.ts case "ENCRYPT_MESSAGE"
  found: Line 531: `if (!_cachedKeys) throw new Error("Keys not unlocked — call LOGIN_DECRYPT first");`
  implication: This is the exact error thrown — _cachedKeys is null when ENCRYPT_MESSAGE is received

- timestamp: 2026-02-28
  checked: RegisterPage.tsx registration flow
  found: register() is called (generates+wraps keypairs) but loginDecrypt() is NEVER called — _cachedKeys stays null
  implication: After registration, login() is called which sets keysRestored:true, but the worker still has _cachedKeys=null. First message send after fresh registration always fails.

- timestamp: 2026-02-28
  checked: useAuth.tsx login() callback
  found: login() only calls setAccessToken and setState — does not call loginDecrypt
  implication: Callers of login() must call loginDecrypt() before calling login(). LoginPage does this. RegisterPage did not.

- timestamp: 2026-02-28
  checked: useAuth.tsx attemptRestore flow
  found: restoreKeys() result was not used to set keysRestored state — it was always thrown away. If restoreKeys returns {restored:false}, _cachedKeys stays null but no CryptoUnlockPrompt is shown.
  implication: Page reload with missing IndexedDB keys = silent failure, user can try to send and get "Keys not unlocked"

## Resolution

root_cause: Two bugs introduced by uncommitted changes:
  1. CryptoUnlockPrompt was removed from ChannelView.tsx without a replacement mechanism. The old probe useEffect detected _cachedKeys=null and showed the prompt; the new code removed this entirely, allowing sends when keys are not loaded.
  2. RegisterPage.tsx never called loginDecrypt() after register() — so after fresh registration, _cachedKeys was always null in the worker.

fix: |
  1. Added `keysRestored: boolean` to AuthState in useAuth.tsx, exposed `setKeysRestored` from context
  2. login() now sets keysRestored:true (safe because all callers must call loginDecrypt first)
  3. attemptRestore() now properly tracks restoreKeys() result into keysRestored state
  4. ChannelView.tsx restored to use CryptoUnlockPrompt when !keysRestored, and disabled={!keysRestored} on MessageInput
  5. RegisterPage.tsx now calls loginDecrypt() between register() and login() to populate _cachedKeys

verification: tsc --noEmit passes with no errors across all changed files

files_changed:
  - apps/client/src/hooks/useAuth.tsx
  - apps/client/src/pages/server/ChannelView.tsx
  - apps/client/src/pages/auth/RegisterPage.tsx
