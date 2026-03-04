# Phase 6: Files and Media - Research

**Researched:** 2026-03-04
**Domain:** Client-side file encryption, MinIO presigned URLs, file attachment UI
**Confidence:** HIGH

## Summary

Phase 6 adds encrypted file uploads and profile avatars to Tether. The architecture mirrors the existing E2EE message pattern: files are encrypted client-side with AES-256-GCM before leaving the browser, uploaded directly to MinIO via presigned PUT URLs, and decrypted client-side on download. The server never sees file bytes -- it only coordinates presigned URL generation and stores file metadata.

MinIO is already running in Docker Compose with health checks and persistent volume storage. The server needs `@aws-sdk/client-s3` (or the lighter `@aws-sdk/s3-request-presigner` + `@aws-sdk/client-s3`) to generate presigned URLs. The client needs new crypto worker operations (`ENCRYPT_FILE` / `DECRYPT_FILE`) and UI additions to MessageInput (file picker) and MessageItem (inline image preview, download links).

**Primary recommendation:** Use `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` on the server for presigned URL generation. Encrypt whole files (not chunked) with AES-256-GCM in the crypto worker for files up to 25MB. Wrap the file encryption key per-recipient using the existing ECDH envelope pattern. Store file metadata in a new `attachments` table linked to messages. Avatars are public (unencrypted) since they display to all users.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FILE-01 | User can upload files/images encrypted at rest to MinIO | Presigned URL flow (06-01), client-side file encryption (06-02), new `attachments` DB table, crypto worker ENCRYPT_FILE/DECRYPT_FILE operations |
| FILE-02 | Uploaded images display inline preview in chat | MessageItem attachment rendering (06-03), client-side decrypt + blob URL for images, content-type detection |
| FILE-03 | User can upload and display a profile avatar | Avatar upload flow (06-04), public (unencrypted) presigned PUT to `avatars` bucket, `users.avatarUrl` field already exists in schema |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@aws-sdk/client-s3` | ^3.x | S3 client for MinIO communication | Official AWS SDK, works with any S3-compatible store including MinIO |
| `@aws-sdk/s3-request-presigner` | ^3.x | Generate presigned PUT/GET URLs | Lightweight presigner, avoids bundling full S3 transfer utilities |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Web Crypto API (built-in) | N/A | AES-256-GCM file encryption/decryption | All file crypto in existing crypto worker |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@aws-sdk/client-s3` | `minio` npm package | MinIO's own client, but AWS SDK is more portable and better maintained |
| Whole-file encryption | Chunked streaming encryption | Streaming needed only for files >100MB; adds significant complexity for no benefit at 25MB limit |

**Installation:**
```bash
cd apps/server && pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

No new client dependencies needed -- Web Crypto API and existing crypto worker handle everything.

## Architecture Patterns

### Recommended Project Structure
```
apps/server/src/
  lib/
    s3.ts                         # S3Client singleton + presigned URL helpers
  routes/
    files/
      presign-upload.ts           # POST /api/files/presign-upload — returns presigned PUT URL
      presign-download.ts         # GET /api/files/:attachmentId/download — returns presigned GET URL
    avatars/
      presign-upload.ts           # POST /api/avatars/presign-upload — returns presigned PUT for avatar
  db/
    schema.ts                     # Add attachments table

apps/client/src/
  workers/
    crypto.worker.ts              # Add ENCRYPT_FILE and DECRYPT_FILE operations
  lib/
    crypto.ts                     # Add encryptFile() and decryptFile() API wrappers
    file-upload.ts                # Upload orchestrator: encrypt -> presign -> PUT to MinIO
  hooks/
    useFileUpload.ts              # React hook for upload state management
  components/
    chat/
      MessageInput.tsx            # Add file picker button (paperclip icon)
      MessageItem.tsx             # Add attachment rendering (inline image / download link)
      FileAttachment.tsx          # New: renders a single file attachment
      ImagePreview.tsx            # New: inline image with lightbox on click
      UploadProgress.tsx          # New: upload progress indicator

packages/shared/src/types/
    file.ts                       # Attachment types, presign request/response types
    crypto-worker.ts              # Add ENCRYPT_FILE / DECRYPT_FILE request/result types
```

### Pattern 1: Presigned URL Upload Flow
**What:** Server generates short-lived presigned PUT URL; client uploads encrypted bytes directly to MinIO.
**When to use:** All file uploads (attachments and avatars).
**Example:**
```typescript
// Server: apps/server/src/lib/s3.ts
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT || "http://minio:9000",
  region: "us-east-1", // MinIO ignores this but SDK requires it
  credentials: {
    accessKeyId: process.env.MINIO_ROOT_USER!,
    secretAccessKey: process.env.MINIO_ROOT_PASSWORD!,
  },
  forcePathStyle: true, // Required for MinIO (not virtual-hosted buckets)
});

export async function getPresignedPutUrl(bucket: string, key: string, contentLength: number): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentLength: contentLength,
  });
  return getSignedUrl(s3, command, { expiresIn: 300 }); // 5 min expiry
}

export async function getPresignedGetUrl(bucket: string, key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  return getSignedUrl(s3, command, { expiresIn: 3600 }); // 1 hour expiry
}
```

### Pattern 2: Client-Side File Encryption
**What:** AES-256-GCM encrypt file bytes in crypto worker before upload.
**When to use:** All encrypted file attachments (NOT avatars -- avatars are public).
**Example:**
```typescript
// In crypto.worker.ts — ENCRYPT_FILE handler
case "ENCRYPT_FILE": {
  // 1. Generate fresh AES-256-GCM file key
  const fileKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, // extractable for wrapping
    ["encrypt", "decrypt"],
  );

  // 2. Encrypt entire file with file key
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    fileKey,
    payload.fileBytes, // ArrayBuffer from FileReader
  );

  // 3. Wrap file key per-recipient (same ECDH pattern as messages)
  const wrappedKeys = []; // ... same loop as ENCRYPT_MESSAGE

  postResult({
    encryptedFile: new Uint8Array(ciphertext),
    fileIv: uint8ToBase64(iv),
    recipients: wrappedKeys,
  });
}
```

### Pattern 3: Attachment Message Envelope
**What:** Messages with attachments include attachment metadata alongside the encrypted content.
**When to use:** When sending a message with a file attached.
**Flow:**
1. Client encrypts file -> gets ciphertext + per-recipient wrapped file keys
2. Client requests presigned PUT URL from server (includes file metadata: size, MIME type, filename)
3. Client PUTs encrypted bytes directly to MinIO
4. Client sends message with attachment metadata (attachmentId, original filename, size, MIME type, encrypted file key data)
5. Server stores attachment record linked to message
6. Recipients download via presigned GET URL, decrypt client-side

### Pattern 4: Avatar Upload (Public, Unencrypted)
**What:** Avatars are NOT encrypted because they display to all users across all contexts.
**When to use:** Profile avatar uploads only.
**Flow:**
1. Client selects image, resizes client-side (max 256x256), converts to WebP/PNG
2. Client requests presigned PUT URL from server for `avatars` bucket
3. Client PUTs raw image bytes directly to MinIO
4. Server updates `users.avatarUrl` with the MinIO object path
5. Avatar images served via presigned GET URLs (or direct if bucket is public)

### Anti-Patterns to Avoid
- **Streaming file bytes through the server:** Defeats zero-knowledge. Always use presigned URLs for direct client-to-MinIO upload.
- **Encrypting avatars:** Avatars are public by design. Encrypting them adds complexity with no security benefit since they display to everyone.
- **Using `readAsDataURL` for large files:** Creates a base64 string 33% larger than the file. Use `readAsArrayBuffer` instead.
- **Single presigned URL for both upload and download:** Always generate separate PUT (upload) and GET (download) URLs with appropriate expiry.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| S3 presigned URL signing | Custom HMAC-SHA256 signing | `@aws-sdk/s3-request-presigner` | AWS SigV4 signing is complex; library handles edge cases |
| Image resizing (avatars) | Canvas-based manual resize | `<canvas>` with `drawImage()` | Built-in browser API, no library needed, but use it correctly |
| MIME type detection | File extension parsing | `file.type` from File API | Browser's native detection is reliable |
| File encryption | Custom cipher construction | Web Crypto AES-256-GCM | Never roll your own crypto |

**Key insight:** The existing crypto worker pattern (generate key, encrypt data, wrap key per-recipient via ECDH) works identically for files. The only difference is the plaintext is binary (ArrayBuffer) instead of text (string).

## Common Pitfalls

### Pitfall 1: MinIO Bucket Auto-Creation
**What goes wrong:** Server starts, tries to generate presigned URL, bucket doesn't exist, 404.
**Why it happens:** MinIO starts with no buckets. Unlike S3, there's no automatic bucket creation.
**How to avoid:** Create buckets on server startup using `CreateBucketCommand` with `try/catch` for already-exists. Need two buckets: `attachments` (private) and `avatars` (public-read).
**Warning signs:** 404 or "NoSuchBucket" errors from MinIO.

### Pitfall 2: CORS on MinIO for Direct Upload
**What goes wrong:** Browser blocks PUT to MinIO presigned URL due to CORS.
**Why it happens:** MinIO needs explicit CORS config to accept cross-origin requests from the browser.
**How to avoid:** Either (a) proxy MinIO through nginx with CORS headers, or (b) configure MinIO CORS via environment variables or mc CLI. Proxying through nginx is cleaner since the client already routes through nginx.
**Warning signs:** CORS preflight failures in browser console.

### Pitfall 3: Presigned URL Contains Internal Docker Hostname
**What goes wrong:** Server generates presigned URL like `http://minio:9000/...` -- browser can't resolve `minio` hostname.
**Why it happens:** S3Client's endpoint is the Docker-internal `minio:9000`.
**How to avoid:** Two approaches: (a) Use nginx to proxy `/storage/*` to `minio:9000` and generate presigned URLs with the public-facing hostname, or (b) generate presigned URLs with a public endpoint override. The nginx proxy approach is more consistent with the existing architecture.
**Warning signs:** `net::ERR_NAME_NOT_RESOLVED` in browser for `minio:9000`.

### Pitfall 4: File Size Limits
**What goes wrong:** Large file uploads fail or hang.
**Why it happens:** No size validation; browser may OOM on large files during encryption (entire file must fit in memory for AES-GCM).
**How to avoid:** Enforce 25MB max file size client-side AND server-side (presign request validates). AES-GCM can handle 25MB in-memory on modern devices without issue. For avatars, enforce 5MB max.
**Warning signs:** Browser tab crashes, slow encryption, timeout errors.

### Pitfall 5: Race Between Upload and Message Send
**What goes wrong:** Message references an attachment that hasn't finished uploading to MinIO.
**Why it happens:** Client sends message before PUT to MinIO completes.
**How to avoid:** Sequence the operations: encrypt -> presign -> PUT to MinIO -> wait for 200 -> THEN send message with attachment metadata. Use a state machine (idle -> encrypting -> uploading -> sending -> done).

### Pitfall 6: Nginx Body Size Limit (avatars only)
**What goes wrong:** If avatars are uploaded through the API (not presigned), nginx's default `client_max_body_size` (1MB) rejects the upload.
**Why it happens:** Default nginx config doesn't expect large request bodies.
**How to avoid:** Since we use presigned URLs for direct-to-MinIO upload, this doesn't apply to the main flow. But the nginx proxy path for MinIO needs appropriate limits.

## Code Examples

### Database Schema: Attachments Table
```typescript
// Add to apps/server/src/db/schema.ts
export const attachments = pgTable("attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  uploaderId: uuid("uploader_id")
    .notNull()
    .references(() => users.id),
  // MinIO object key (path within bucket)
  storageKey: text("storage_key").notNull(),
  // Original filename (plaintext — not sensitive; helps UX)
  fileName: text("file_name").notNull(),
  // MIME type for rendering (image/png, application/pdf, etc.)
  mimeType: text("mime_type").notNull(),
  // Size in bytes (encrypted size, for display)
  fileSize: integer("file_size").notNull(),
  // AES-256-GCM IV used for file encryption
  fileIv: text("file_iv").notNull(), // base64
  // Whether this is an image (for inline preview rendering)
  isImage: integer("is_image").notNull().default(0), // 0 or 1 (boolean as int for Drizzle)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

### Attachment Recipient Keys Table
```typescript
// Per-recipient wrapped file encryption key — same pattern as messageRecipientKeys
export const attachmentRecipientKeys = pgTable(
  "attachment_recipient_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attachmentId: uuid("attachment_id")
      .notNull()
      .references(() => attachments.id, { onDelete: "cascade" }),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id),
    encryptedFileKey: bytea("encrypted_file_key").notNull(),
    ephemeralPublicKey: bytea("ephemeral_public_key").notNull(),
  },
  (t) => [uniqueIndex("ark_attachment_recipient_idx").on(t.attachmentId, t.recipientUserId)],
);
```

### Nginx MinIO Proxy
```nginx
# Add to nginx.conf — proxy MinIO through nginx to avoid CORS and hostname issues
upstream minio_backend {
    server minio:9000;
}

location /storage/ {
    proxy_pass http://minio_backend/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    client_max_body_size 26m; # 25MB file + overhead
    proxy_request_buffering off; # Stream directly, don't buffer
}
```

### Presign Upload Route
```typescript
// POST /api/files/presign-upload
interface PresignUploadBody {
  fileName: string;
  mimeType: string;
  fileSize: number; // encrypted size in bytes
  channelId: string; // for access control
}

// Response:
interface PresignUploadResponse {
  uploadUrl: string; // presigned PUT URL (via nginx proxy path)
  attachmentId: string; // pre-generated UUID for the attachment record
  storageKey: string; // MinIO object key
}
```

### Client Upload Orchestration
```typescript
// apps/client/src/lib/file-upload.ts
export async function uploadEncryptedFile(
  file: File,
  channelId: string,
  recipients: Array<{ userId: string; x25519PublicKey: string }>,
): Promise<AttachmentMetadata> {
  // 1. Read file as ArrayBuffer
  const fileBytes = await file.arrayBuffer();

  // 2. Encrypt in crypto worker (returns ciphertext + per-recipient wrapped keys)
  const encrypted = await encryptFile(fileBytes, recipients);

  // 3. Request presigned PUT URL from server
  const presign = await api.post<PresignUploadResponse>("/api/files/presign-upload", {
    fileName: file.name,
    mimeType: file.type,
    fileSize: encrypted.encryptedFile.byteLength,
    channelId,
  });

  // 4. PUT encrypted bytes directly to MinIO via presigned URL
  await fetch(presign.uploadUrl, {
    method: "PUT",
    body: encrypted.encryptedFile,
    headers: { "Content-Type": "application/octet-stream" },
  });

  // 5. Return metadata for message envelope
  return {
    attachmentId: presign.attachmentId,
    fileName: file.name,
    mimeType: file.type,
    fileSize: file.size, // original size for display
    fileIv: encrypted.fileIv,
    recipients: encrypted.recipients,
    isImage: file.type.startsWith("image/"),
  };
}
```

### Shared Types
```typescript
// packages/shared/src/types/file.ts
export interface AttachmentData {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  isImage: boolean;
  fileIv: string; // base64
  recipientKey: {
    encryptedFileKey: string; // base64
    ephemeralPublicKey: string; // base64
  } | null;
}

export interface MessageResponse {
  // ... existing fields ...
  attachments: AttachmentData[]; // NEW: array of file attachments
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Upload through server proxy | Presigned URL direct upload | Standard since S3 inception | Server never touches file bytes |
| `minio` npm package | `@aws-sdk/client-s3` | AWS SDK v3 (2020+) | Portable across S3-compatible stores |
| File-level public key encryption | Symmetric key + per-recipient wrapping | Standard E2EE pattern | Efficient for multiple recipients |

## Open Questions

1. **File key wrapping: reuse message key or separate?**
   - What we know: Files could share the message's AES key, but this couples file encryption to message encryption
   - Recommendation: Use a SEPARATE file key per attachment. This allows files to be independently re-keyed and avoids the constraint that file + message must always travel together.

2. **Image thumbnail generation**
   - What we know: Inline previews need thumbnails. Full-size images shouldn't be loaded into the message list.
   - Recommendation: Generate a small thumbnail client-side (max 400px wide) using `<canvas>`, encrypt separately, upload as a second object with `-thumb` suffix. The thumbnail gets its own recipient keys. This avoids loading full-resolution images into the chat scroll.

3. **Nginx proxy vs public MinIO bucket for avatars**
   - What we know: Avatars are public and unencrypted. They could either go through nginx proxy or MinIO could be configured with a public-read bucket.
   - Recommendation: Use nginx proxy (`/storage/avatars/...`) for consistency. Avoids exposing MinIO port publicly and keeps all traffic through the single nginx entry point.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (existing E2E) |
| Config file | apps/e2e/playwright.config.ts |
| Quick run command | `cd apps/e2e && npx playwright test --grep "file"` |
| Full suite command | `cd apps/e2e && npx playwright test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FILE-01 | File encrypted and uploaded to MinIO via presigned URL | E2E | `npx playwright test tests/05-files.spec.ts` | No - Wave 0 |
| FILE-02 | Image attachment renders inline preview in chat | E2E | `npx playwright test tests/05-files.spec.ts` | No - Wave 0 |
| FILE-03 | Avatar upload and display across UI | E2E | `npx playwright test tests/06-avatar.spec.ts` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** Manual verification via browser
- **Per wave merge:** Full E2E suite
- **Phase gate:** All E2E tests green + manual UAT

### Wave 0 Gaps
- [ ] `apps/e2e/tests/05-files.spec.ts` -- covers FILE-01, FILE-02
- [ ] `apps/e2e/tests/06-avatar.spec.ts` -- covers FILE-03
- [ ] MinIO bucket creation script or server startup logic

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `apps/server/src/db/schema.ts` -- existing data model with `users.avatarUrl` field
- Codebase analysis: `apps/client/src/workers/crypto.worker.ts` -- existing ENCRYPT_MESSAGE/DECRYPT_MESSAGE pattern (lines 532-684)
- Codebase analysis: `apps/server/src/routes/messages/create.ts` -- existing message envelope pattern
- Codebase analysis: `docker-compose.yml` -- MinIO already configured (lines 118-137)
- Codebase analysis: `packages/shared/src/types/message.ts` -- existing MessageResponse/MessageEnvelope types
- Codebase analysis: `.env` -- MINIO_ROOT_USER/MINIO_ROOT_PASSWORD already defined

### Secondary (MEDIUM confidence)
- AWS SDK v3 documentation: `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` for MinIO compatibility
- MinIO documentation: `forcePathStyle: true` required for MinIO S3 compatibility

### Tertiary (LOW confidence)
- None -- all findings are based on codebase analysis and well-established patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- `@aws-sdk/client-s3` with MinIO is battle-tested
- Architecture: HIGH -- presigned URL pattern is standard; crypto pattern mirrors existing message encryption exactly
- Pitfalls: HIGH -- based on direct codebase analysis (Docker internal hostnames, CORS, bucket creation are concrete known issues)

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable domain, no fast-moving dependencies)
