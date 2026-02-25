# Phase 1: Foundation - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Monorepo skeleton, client-side key hierarchy (PBKDF2/HKDF, X25519/Ed25519), auth with key derivation, Docker Compose with Coturn isolation, authenticated Socket.IO skeleton. This is the cryptographic and structural bedrock — every subsequent phase builds on this without touching crypto primitives.

</domain>

<decisions>
## Implementation Decisions

### Auth UI experience
- Split layout: left panel has branding/tagline on dark background with electric blue/cyan accent, right panel has the form on lighter background
- Spinner with status text during key derivation — show steps like "Deriving keys...", "Generating keypair...", "Encrypting vault...", "Done!" (consistent across registration, login, and password change)
- Password change also shows status steps during re-encryption (same pattern as registration)
- Subtle E2EE trust signals — small note or footer text on auth page, not prominent messaging
- Inline validation errors directly below the offending field (red text)
- After successful registration, show a brief welcome/onboarding screen ("Create your first server" or "Join with an invite link")
- Brand colors: electric blue / cyan palette

### Password policy & recovery
- Minimum 8 characters with a visual strength meter (weak/fair/strong) — no strict complexity requirements
- Confirm password field on registration (two password fields to prevent typos — critical since password loss = key loss)
- Recovery key generated at signup — a one-time key the user can save to re-derive keys if password forgotten
- Forced copy step for recovery key: user must click "Copy" or "I've saved this" before proceeding (like crypto wallet seed phrase flows)
- Clear warning at registration that password loss without recovery key means account data is gone

### Client framework & styling
- React with Vite
- Tailwind CSS for styling
- shadcn/ui as component library (Radix-based, Tailwind-styled, copy-paste components); build custom components for anything shadcn doesn't cover
- Dark-first visual tone (dark mode as default/primary, light mode can come later)

### Claude's Discretion
- Exact Tailwind theme configuration and color scale
- Auth form field order and spacing
- Strength meter implementation approach
- Recovery key format (word list vs random string)
- Onboarding screen content and layout
- Loading skeleton patterns
- Error state handling beyond validation (network errors, server errors)

</decisions>

<specifics>
## Specific Ideas

- Key derivation progress should feel like a real process happening, not a generic loading state — the user should understand their keys are being created locally
- The split auth layout left panel should communicate the core value prop: encrypted, self-hosted, yours
- Recovery key flow should feel serious but not scary — similar to how crypto wallets handle seed phrases

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-02-25*
