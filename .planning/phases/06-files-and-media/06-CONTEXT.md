# Phase 6: Files and Media — Context

**Phase:** 6
**Name:** Files and Media
**Depends on:** Phase 3 (message envelope for file key wrapping)

## Goal

Users can upload files and images that are encrypted client-side before leaving the browser, stored in MinIO, and displayed inline in chat — the server never sees file bytes.

## Success Criteria

1. User can attach a file or image to a message; the file is encrypted in the browser before upload and the server only handles presigned PUT coordination
2. An image attachment displays as an inline preview in the message thread; clicking it opens the full image (decrypted client-side from MinIO)
3. Non-image file attachments display as a download link with file name and size; the downloaded file decrypts correctly to the original bytes
4. User can upload a profile avatar that appears next to their name throughout the UI; the avatar is stored in MinIO via presigned URL

## Requirements

| ID | Description |
|----|-------------|
| FILE-01 | Encrypted file uploads to MinIO via presigned URLs |
| FILE-02 | Inline image previews + file download links in chat |
| FILE-03 | Profile avatar upload and display |

## Decisions

| Decision | Rationale |
|----------|-----------|
| Separate file key per attachment (not shared with message key) | Independent re-keying, decouples file from message lifecycle |
| Whole-file AES-256-GCM encryption (not chunked) | 25MB limit makes chunking unnecessary; simpler implementation |
| Nginx proxy for MinIO (`/storage/*`) | Avoids Docker hostname resolution issues and CORS config |
| Avatars are public (unencrypted) | They display to all users; encrypting adds no security value |
| Two MinIO buckets: `attachments` (private) + `avatars` (public) | Separation of encrypted vs public content |
| Client-side thumbnail generation (400px max) | Avoids loading full-res images in chat scroll |

## Plan Breakdown

- **06-01**: MinIO presigned URL infrastructure (S3 client, bucket creation, presign routes, nginx proxy, attachments schema)
- **06-02**: Client-side file encryption (ENCRYPT_FILE/DECRYPT_FILE crypto worker ops, file upload orchestrator, shared types)
- **06-03**: File attachment UI (file picker, upload progress, inline image preview, download links, lightbox)
- **06-04**: Profile avatars (avatar upload flow, presigned URL, avatar display across UI)
