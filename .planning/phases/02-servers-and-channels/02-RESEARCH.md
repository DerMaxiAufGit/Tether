# Phase 2: Servers and Channels - Research

**Researched:** 2026-02-25
**Domain:** REST API (Fastify 5 + Drizzle ORM), real-time events (Socket.IO rooms), server/channel CRUD, invite system, drag-and-drop reordering, Discord-like sidebar UI (React Router v7 + TanStack Query + dnd-kit)
**Confidence:** HIGH (core libraries verified via npm, official docs, WebFetch)

---

## Summary

Phase 2 adds the full server/channel organizational layer atop Phase 1's auth foundation. The work splits cleanly into four tracks: (1) server CRUD REST API with Socket.IO broadcast, (2) invite generation and join flow with expiry/max-use enforcement, (3) channel CRUD with drag-and-drop position reordering, and (4) the Discord-style UI (server icon strip, collapsible channel list, settings panels, member list).

The schema is already fully defined in `schema.ts` — servers, channels, server_members, invites, roles, member_roles, and channel_overrides tables are all present. No new migrations are needed for Phase 2 core features. The existing Fastify route plugin pattern (`async function route(fastify) { fastify.post(...) }`) and `fastify.authenticate` preHandler are the correct patterns to follow throughout.

The biggest architectural decision is **how the client gets its server/channel data**. The correct pattern for this stack is TanStack Query v5 for REST data (with `queryClient.invalidateQueries` triggered by Socket.IO events) combined with React Router v7 nested routes (`/servers/:serverId/channels/:channelId`). The sidebar layout replaces the current WelcomePage — the main protected route at `/` becomes the full Discord-style shell.

**Primary recommendation:** Add TanStack Query v5 and dnd-kit to the client; use `crypto.randomBytes` (Node built-in) for invite code generation server-side; use Socket.IO rooms named `server:{serverId}` for broadcast; follow the existing Fastify plugin/preHandler pattern for all new routes.

---

## Standard Stack

### New Libraries Needed

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tanstack/react-query` | 5.90.21 | Server-state cache (server list, channels, members) | Eliminates manual loading/error state, auto-invalidation on mutation, deduplication |
| `@dnd-kit/core` | 6.3.1 | Drag-and-drop engine | Accessible (keyboard support), React 19 compatible, modular |
| `@dnd-kit/sortable` | 10.0.0 | Sortable list preset for dnd-kit | Provides `useSortable` hook and `arrayMove` utility |
| `@dnd-kit/utilities` | latest | CSS transform helpers for dnd-kit | `CSS.Transform.toString()` for smooth drag animations |

**Already in the stack (no new installs needed):**
- Fastify 5 + Drizzle ORM + postgres.js — existing route/DB pattern
- Socket.IO v4 + `@socket.io/redis-streams-adapter` — existing real-time layer
- React Router v7 (`react-router-dom` already installed) — nested routes for server/channel navigation
- `radix-ui` (unified package, already installed as `radix-ui@1.4.3`) — Dialog, DropdownMenu, Tooltip
- Tailwind v4 + shadcn/ui components — existing styling system

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `nanoid` | 5.1.6 | Invite code generation | Already available in npm ecosystem; 21-char URL-safe IDs |
| Node `crypto` built-in | — | Cryptographically secure random bytes | Alternative to nanoid: `crypto.randomBytes(8).toString('base64url')` gives 11-char URL-safe code |

**Note on invite code generation:** The project already uses Node's `crypto` module extensively (in the auth layer). Use `crypto.randomBytes(8).toString('base64url')` for invite codes — no new dependency needed. This gives 11 URL-safe characters which is plenty for invite links. If nanoid is preferred for readability, it is ESM-only and already supported by the project's `"type": "module"` setup.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TanStack Query | Zustand + manual fetch | Zustand is fine for UI state; TanStack Query is the right tool for server state specifically — cache, invalidation, deduplication all built-in |
| `@dnd-kit` | `react-beautiful-dnd` | react-beautiful-dnd is unmaintained (archived 2023); dnd-kit is the current standard |
| `@dnd-kit` | HTML5 drag API manually | Missing keyboard support, no collision detection, touch events are inconsistent |
| TanStack Query | Context + useEffect | Manual loading/error/refetch logic is error-prone and duplicated; TQ solves all of it |

**Installation:**
```bash
# Client additions
pnpm --filter @tether/client add @tanstack/react-query @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities

# No new server dependencies needed
# (nanoid optional — crypto.randomBytes is the zero-dep alternative)
```

---

## Architecture Patterns

### Recommended Project Structure

```
apps/server/src/
├── routes/
│   ├── auth/               # existing
│   ├── servers/
│   │   ├── index.ts        # GET /api/servers (list my servers)
│   │   ├── create.ts       # POST /api/servers
│   │   ├── [id].ts         # GET/PATCH/DELETE /api/servers/:id
│   │   ├── members.ts      # DELETE /api/servers/:id/members/:userId (kick/leave)
│   │   └── invites.ts      # GET/POST/DELETE /api/servers/:id/invites
│   └── channels/
│       ├── index.ts        # GET /api/servers/:serverId/channels
│       ├── create.ts       # POST /api/servers/:serverId/channels
│       ├── [id].ts         # PATCH/DELETE /api/channels/:id
│       └── reorder.ts      # PATCH /api/servers/:serverId/channels/reorder
├── socket/
│   ├── handlers/
│   │   ├── connection.ts   # existing — add server:join room logic here
│   │   └── servers.ts      # new — server:leave, server:delete events
│   └── rooms.ts            # room name constants: server:{id}, user:{id}

apps/client/src/
├── lib/
│   ├── api.ts              # existing fetch wrapper
│   └── queryClient.ts      # new — QueryClient singleton
├── hooks/
│   ├── useAuth.tsx         # existing
│   ├── useSocket.ts        # new — singleton socket + connection lifecycle
│   ├── useServers.ts       # new — useQuery for server list
│   └── useChannels.ts      # new — useQuery for channel list
├── pages/
│   ├── auth/               # existing
│   ├── AppShell.tsx        # new — main layout: icon strip + channel panel + outlet
│   ├── invite/
│   │   └── InvitePage.tsx  # new — /invite/:code handler
│   └── server/
│       ├── ServerView.tsx  # new — channel list + chat area outlet
│       └── settings/
│           └── ServerSettings.tsx
└── components/
    ├── ui/                 # shadcn primitives
    ├── server/
    │   ├── ServerList.tsx          # icon strip
    │   ├── ServerIcon.tsx          # single server icon with pill/morph
    │   ├── ChannelList.tsx         # collapsible categories + channels
    │   ├── ChannelItem.tsx         # sortable channel row
    │   └── CreateServerModal.tsx
    └── invite/
        └── InviteModal.tsx
```

### Pattern 1: Fastify Route Plugin (follow existing auth pattern)

**What:** Each route is a standalone async Fastify plugin exported as default. Registered in `index.ts` with prefix.
**When to use:** All new REST endpoints follow this pattern without exception.

```typescript
// Source: apps/server/src/routes/auth/change-password.ts (existing pattern)
import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { servers, serverMembers } from "../../db/schema.js";
import { eq, and } from "drizzle-orm";

export default async function createServerRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: { name: string } }>("/", {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 100 },
        },
      },
    },
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { name } = request.body;

      const result = await db.transaction(async (tx) => {
        const [server] = await tx.insert(servers).values({
          name,
          ownerId: userId,
        }).returning();

        await tx.insert(serverMembers).values({
          serverId: server.id,
          userId,
        });

        // Create default channels
        await tx.insert(channels).values([
          { serverId: server.id, name: "general", type: "text", position: 0 },
          { serverId: server.id, name: "General", type: "voice", position: 1 },
        ]);

        return server;
      });

      // Broadcast to the creator's personal room (user:{userId})
      fastify.io.to(`user:${userId}`).emit("server:created", result);

      return reply.code(201).send(result);
    },
  });
}
```

**Registration in index.ts:**
```typescript
// Group server routes under /api/servers prefix
await server.register(createServerRoute, { prefix: "/api/servers" });
await server.register(listServersRoute, { prefix: "/api/servers" });
// etc.
```

### Pattern 2: Socket.IO Room Strategy

**What:** On connection, join user to their personal room and all server rooms they're a member of.
**When to use:** Connection handler — runs immediately after auth middleware.

```typescript
// Source: socket.io official docs + existing connection.ts pattern
// apps/server/src/socket/handlers/connection.ts

export async function registerConnectionHandlers(
  socket: Socket,
  logger: FastifyBaseLogger
): Promise<void> {
  const userId = socket.data.userId;

  // 1. Join personal room for direct notifications
  await socket.join(`user:${userId}`);

  // 2. Join all servers the user is a member of
  const memberships = await db
    .select({ serverId: serverMembers.serverId })
    .from(serverMembers)
    .where(eq(serverMembers.userId, userId));

  for (const { serverId } of memberships) {
    await socket.join(`server:${serverId}`);
  }

  logger.info({ userId, rooms: memberships.length }, "User joined rooms");

  socket.on("disconnect", (reason) => {
    // Socket.IO auto-removes from all rooms on disconnect
    logger.info({ userId, reason }, "User disconnected");
  });
}
```

**Room naming convention:**
- `user:{userId}` — personal room for notifications only the user receives
- `server:{serverId}` — server room for member-wide broadcasts

**Broadcasting server events:**
```typescript
// From a route handler that has access to fastify.io:
// Member joins server -> all existing members see new member
fastify.io.to(`server:${serverId}`).emit("member:joined", { serverId, userId, member });

// Server deleted -> all members see deletion
fastify.io.to(`server:${serverId}`).emit("server:deleted", { serverId });

// Channel created/updated/deleted -> all server members
fastify.io.to(`server:${serverId}`).emit("channel:created", { channel });
```

### Pattern 3: TanStack Query for Server State

**What:** All REST data (server list, channels, members) goes through TanStack Query. Mutations call `queryClient.invalidateQueries` after success.
**When to use:** All useQuery/useMutation hooks in client components.

```typescript
// Source: https://tanstack.com/query/v5/docs/framework/react/quick-start
// apps/client/src/lib/queryClient.ts
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,        // 30s — servers/channels don't change that often
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
```

```typescript
// Wrap app in QueryClientProvider — add alongside AuthProvider in App.tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}
```

```typescript
// apps/client/src/hooks/useServers.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useServers() {
  return useQuery({
    queryKey: ["servers"],
    queryFn: () => api.get<Server[]>("/api/servers"),
  });
}

export function useCreateServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string }) => api.post("/api/servers", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["servers"] });
    },
  });
}
```

### Pattern 4: Socket.IO + TanStack Query Integration

**What:** Socket.IO events invalidate TanStack Query cache, triggering automatic refetch.
**When to use:** In the root layout component that owns the socket connection.

```typescript
// Source: TanStack Query official docs + Socket.IO how-to-use-with-react
// apps/client/src/pages/AppShell.tsx

useEffect(() => {
  socket.on("server:created", () => {
    queryClient.invalidateQueries({ queryKey: ["servers"] });
  });
  socket.on("member:joined", ({ serverId }: { serverId: string }) => {
    queryClient.invalidateQueries({ queryKey: ["servers", serverId, "members"] });
  });
  socket.on("server:deleted", ({ serverId }: { serverId: string }) => {
    queryClient.invalidateQueries({ queryKey: ["servers"] });
    // Navigate away if currently viewing deleted server
  });
  socket.on("channel:created", ({ channel }: { channel: Channel }) => {
    queryClient.invalidateQueries({ queryKey: ["servers", channel.serverId, "channels"] });
  });

  return () => {
    socket.off("server:created");
    socket.off("member:joined");
    socket.off("server:deleted");
    socket.off("channel:created");
  };
}, [queryClient]);
```

### Pattern 5: React Router v7 Nested Routes for App Shell

**What:** The main `/` route becomes an `AppShell` layout that contains the server icon strip. Nested routes handle server/channel navigation.
**When to use:** Replace the current WelcomePage at `/` with the full Discord shell.

```typescript
// Source: https://reactrouter.com/start/declarative/routing
// apps/client/src/App.tsx — updated routes section

<Route path="/" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
  {/* No server selected — show welcome/empty state */}
  <Route index element={<WelcomeView />} />
  {/* Server selected — show channel list */}
  <Route path="servers/:serverId" element={<ServerView />}>
    {/* No channel selected */}
    <Route index element={<ChannelPlaceholder />} />
    {/* Channel selected */}
    <Route path="channels/:channelId" element={<ChannelView />} />
  </Route>
</Route>

{/* Invite route — public but auto-joins after auth */}
<Route path="invite/:code" element={<InvitePage />} />
```

```typescript
// AppShell renders the icon strip and delegates content to Outlet
export default function AppShell() {
  return (
    <div className="flex h-screen bg-zinc-950">
      <ServerList />           {/* icon strip, always visible */}
      <Outlet />               {/* ServerView or WelcomeView */}
    </div>
  );
}
```

### Pattern 6: Drag-and-Drop Channel Reordering

**What:** Wrap channel list in `DndContext` + `SortableContext`. On drag end, call reorder API.
**When to use:** Channel list in the channel panel sidebar.

```typescript
// Source: https://dndkit.com/presets/sortable (official docs)
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, arrayMove, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableChannelItem({ channel }: { channel: Channel }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: channel.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      {...attributes}
      {...listeners}
      className="channel-item"
    >
      # {channel.name}
    </div>
  );
}

function ChannelList({ serverId }: { serverId: string }) {
  const { data: channels } = useChannels(serverId);
  const [items, setItems] = useState(channels ?? []);
  const reorderMutation = useReorderChannels(serverId);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex(c => c.id === active.id);
    const newIndex = items.findIndex(c => c.id === over.id);
    const reordered = arrayMove(items, oldIndex, newIndex);
    setItems(reordered);  // optimistic update
    reorderMutation.mutate(reordered.map((c, i) => ({ id: c.id, position: i })));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map(c => c.id)} strategy={verticalListSortingStrategy}>
        {items.map(channel => (
          <SortableChannelItem key={channel.id} channel={channel} />
        ))}
      </SortableContext>
    </DndContext>
  );
}
```

### Pattern 7: Bulk Update Channel Positions in Drizzle ORM

**What:** Reorder API receives `[{ id, position }]` and updates all in one transaction using SQL CASE.
**When to use:** `PATCH /api/servers/:serverId/channels/reorder` handler.

```typescript
// Source: https://orm.drizzle.team/docs/guides/update-many-with-different-value
import { sql, inArray, eq } from "drizzle-orm";

async function reorderChannels(
  tx: typeof db,
  updates: { id: string; position: number }[]
) {
  if (updates.length === 0) return;

  const ids = updates.map(u => u.id);

  // Build CASE expression: CASE WHEN id = X THEN 0 WHEN id = Y THEN 1 ... END
  const caseChunks = updates.map(u =>
    sql`WHEN ${channels.id} = ${u.id} THEN ${u.position}`
  );

  await tx.update(channels)
    .set({ position: sql`CASE ${sql.join(caseChunks, sql` `)} END` })
    .where(inArray(channels.id, ids));
}
```

### Pattern 8: Invite Code Generation

**What:** Server-side invite code using Node built-in crypto (no new dependency).
**When to use:** `POST /api/servers/:id/invites` handler.

```typescript
// Source: Node.js crypto docs (built-in, no dependency)
import { randomBytes } from "node:crypto";

function generateInviteCode(): string {
  // 8 random bytes -> 11-char base64url string (URL-safe, no padding)
  return randomBytes(8).toString("base64url");
}

// In route handler:
const code = generateInviteCode();
const expiresAt = body.expiresIn
  ? new Date(Date.now() + body.expiresIn * 1000)
  : null; // null = never expires

const [invite] = await db.insert(invites).values({
  serverId,
  creatorId: userId,
  code,
  maxUses: body.maxUses ?? null,  // null = unlimited
  expiresAt,
}).returning();
```

### Pattern 9: Invite Join Flow with Auth Redirect

**What:** `/invite/:code` route — if authed, join immediately. If not, redirect to /login with `state.from` set, then auto-join after auth.
**When to use:** The `InvitePage` component.

```typescript
// Source: React Router docs + existing ProtectedRoute pattern in App.tsx
// apps/client/src/pages/invite/InvitePage.tsx

export default function InvitePage() {
  const { code } = useParams();
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const joinMutation = useMutation({
    mutationFn: () => api.post(`/api/invites/${code}/join`),
    onSuccess: (server) => {
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      navigate(`/servers/${server.id}`);
    },
  });

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      // Store invite code in location state so login page can redirect back
      navigate("/login", { state: { from: location.pathname } });
      return;
    }
    joinMutation.mutate();
  }, [isAuthenticated, isLoading]);

  // ... render loading/error UI
}
```

### Pattern 10: Server Icon Color Derivation

**What:** Deterministic HSL color from server name/ID — no library needed.
**When to use:** ServerIcon component for initial-letter avatars.

```typescript
// Source: standard web pattern (no library needed)
// apps/client/src/components/server/ServerIcon.tsx

function stringToHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

function ServerIcon({ server, isSelected }: { server: Server; isSelected: boolean }) {
  const hue = stringToHue(server.id); // use ID not name for stability after rename
  const bg = `hsl(${hue}, 45%, 35%)`;
  const initials = server.name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div
      style={{ backgroundColor: bg }}
      className={`
        w-12 h-12 flex items-center justify-center text-white font-bold text-sm
        transition-all duration-200 cursor-pointer
        ${isSelected ? "rounded-2xl" : "rounded-full"}
      `}
    >
      {initials}
    </div>
  );
}
```

### Anti-Patterns to Avoid

- **Registering socket event listeners in every component:** Register once in `AppShell` (or a top-level `useSocketEvents` hook), not in individual page components. Multiple `socket.on("server:created")` calls without cleanup = duplicate events.
- **Storing server/channel data in Zustand:** TanStack Query owns server state. Zustand is for ephemeral UI state (sidebar collapsed, modal open, etc.) only.
- **Reordering channels without optimistic update:** The drag animation will snap back while waiting for the API. Always call `setItems(reordered)` before the mutation.
- **Using `io.emit()` instead of `io.to("server:X").emit()`:** Never broadcast a server event to all connected clients. Always scope to the server room.
- **Fetching all servers eagerly on connection handler:** Do a single DB query for the user's memberships during `socket.join` calls — do not re-query inside every event handler.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-and-drop channel reordering | Custom mouse event handlers | `@dnd-kit/sortable` + `useSortable` + `arrayMove` | Touch support, keyboard accessibility, scroll containers, multi-list drag are all edge cases |
| Server state caching | Zustand + manual fetch + loading booleans | TanStack Query v5 `useQuery` | Deduplication, background refetch, stale-while-revalidate are all non-trivial to build correctly |
| Invite code generation | Custom alphabet + Math.random | `crypto.randomBytes(8).toString('base64url')` | Math.random is not cryptographically secure; collisions are exploitable |
| Deterministic avatar color | Color library | 10-line `stringToHue` function | Libraries like `string-to-color` add a dep for a function that takes 5 minutes to write correctly |
| Bulk position update | Sequential `.update()` calls in a loop | SQL CASE statement via Drizzle's `sql` operator | Sequential updates are O(n) round trips and can deadlock if two users reorder simultaneously |
| Socket room cleanup on disconnect | Manual `socket.on("disconnect", socket.leave(...))` | Nothing — Socket.IO auto-removes from all rooms | Calling leave manually in disconnect handler is redundant noise |

**Key insight:** This phase is mostly plumbing — the real complexity is in the interactions between the four layers (REST mutation -> Socket.IO broadcast -> TanStack Query invalidation -> React re-render). Get the event names and room targeting right, and everything else is straightforward CRUD.

---

## Common Pitfalls

### Pitfall 1: Duplicate Socket Event Listeners

**What goes wrong:** Component mounts, registers `socket.on("server:created", handler)`. Unmounts and remounts (React StrictMode, navigation). Now there are two listeners. Every event fires twice, causing double invalidation and potential UI flicker.
**Why it happens:** `socket.on` accumulates listeners; unlike `addEventListener`, Socket.IO does not deduplicate by default.
**How to avoid:** Always return a cleanup function from `useEffect` that calls `socket.off(eventName, handler)` with the exact same function reference. Register listeners at the AppShell level (once), not in child components.
**Warning signs:** Console shows events being processed twice; React Query refetches happen in pairs.

### Pitfall 2: Channel Position Gaps After Delete

**What goes wrong:** User has channels at positions 0, 1, 2. Deletes position 1. Now positions are 0 and 2. Drag-and-drop `arrayMove` then produces wrong positions because it computes new positions from array indices, not from stored positions.
**Why it happens:** Position is stored as an integer that drifts from array index after deletes.
**How to avoid:** The reorder endpoint always takes the full ordered list and writes positions 0..n-1. After any delete, re-query channels and the client re-normalizes positions on next drag. OR: on delete, immediately compact positions in the same transaction.
**Warning signs:** Channels jump to unexpected positions after a delete-then-drag sequence.

### Pitfall 3: Race Condition on Invite Join

**What goes wrong:** Two users click the same single-use invite link simultaneously. Both read `uses = 0`, both see `uses < maxUses`, both increment and join.
**Why it happens:** Non-atomic read-modify-write.
**How to avoid:** Use a single atomic update with a `WHERE` condition:
```sql
UPDATE invites
SET uses = uses + 1
WHERE code = $code
  AND (max_uses IS NULL OR uses < max_uses)
  AND (expires_at IS NULL OR expires_at > NOW())
RETURNING *;
```
If no row is returned, the invite is invalid/exhausted. This is atomic at the database level.
**Warning signs:** Users report joining servers that should be full.

### Pitfall 4: Socket Room Join Happens Before DB Transaction Commits

**What goes wrong:** New member joins server. Route handler broadcasts `member:joined` to the server room. But the transaction hasn't committed yet (or the new member's socket hasn't joined the `server:{id}` room). The new member doesn't receive their own join event.
**Why it happens:** Broadcast happens inside the route handler but the socket's room list is only updated on the NEXT connection (the new member's socket never called `socket.join(server:newId)` because they weren't a member when they connected).
**How to avoid:** After a user joins a server via invite, their active socket must also join the new server room. Emit a `server:joined` event to the joining user's personal room (`user:{userId}`) which triggers the client to call `socket.join(`server:${serverId}`)` OR simply have the server emit a signal that causes the client to re-establish socket rooms. Simplest approach: the join API response includes the new server data; the client's `InvitePage` navigates to the server which triggers the AppShell to call a socket `server:subscribe` event.
**Warning signs:** User joins a server but doesn't receive real-time channel/message events until page refresh.

### Pitfall 5: `io.to(room).emit()` from Route Handler — `fastify.io` Access

**What goes wrong:** Route handler calls `fastify.io.to(...)` but `fastify.io` is null at the time the route runs.
**Why it happens:** The `io` decorator was pre-set to null in `index.ts` and only assigned after `server.listen()` completes. In practice the server routes only run after startup so this is fine — but TypeScript types show `io: SocketIOServer` which might be `null` early.
**How to avoid:** This is already handled in the existing codebase (`server.decorate("io", null)` then assignment after listen). Routes that call `fastify.io` should only be called after startup. No special handling needed — just be aware it's the existing pattern.
**Warning signs:** TypeScript errors about `io` being null (add null check or trust existing pattern).

### Pitfall 6: Drizzle `returning()` Returns Array, Not Single Row

**What goes wrong:** `await db.insert(...).values(...).returning()` — you expect a single object but get an array.
**Why it happens:** Drizzle always returns an array from `.returning()`.
**How to avoid:** Always destructure: `const [server] = await db.insert(servers).values(...).returning();`
**Warning signs:** TypeScript shows `server` as `Server[]`; runtime errors accessing `server.id` when `server` is an array.

### Pitfall 7: TanStack Query staleTime and Socket.IO Overlap

**What goes wrong:** A socket event invalidates a query, causing a refetch. Meanwhile the query's `staleTime` hasn't expired, so TanStack Query uses the cached value instead of refetching.
**Why it happens:** `invalidateQueries` marks queries as stale, which DOES force a refetch for active (mounted) queries regardless of `staleTime`. This is actually correct behavior — but developers sometimes set `staleTime: Infinity` to prevent background refetches, which then breaks socket-driven updates.
**How to avoid:** Do not set `staleTime: Infinity` for server/channel data. Use 30-60 seconds max. `invalidateQueries` overrides staleTime for active queries.
**Warning signs:** UI doesn't update in real-time despite socket events being received.

### Pitfall 8: Schema Already Has `channels.type` as Text — Voice Channel Type

**What goes wrong:** Phase 5 (voice) expects channels with `type = "voice"`. Phase 2 creates the default voice channel. If phase 2 uses a typo like `"Voice"` (capital V), phase 5 will have mismatched data.
**Why it happens:** No enum constraint in the DB — `type` is plain `text`.
**How to avoid:** Use lowercase `"text"` and `"voice"` consistently. The schema comment says `"text" | "voice" | "dm"`. Share these as a const object in `@tether/shared`.
**Warning signs:** Phase 5 voice join queries return no results for voice channels.

---

## Code Examples

### Verified: Drizzle ORM Bulk Position Update

```typescript
// Source: https://orm.drizzle.team/docs/guides/update-many-with-different-value
import { sql, inArray } from "drizzle-orm";
import { channels } from "../../db/schema.js";
import { db } from "../../db/client.js";

async function bulkUpdateChannelPositions(
  serverId: string,
  updates: { id: string; position: number }[]
) {
  if (updates.length === 0) return;
  const ids = updates.map(u => u.id);

  await db.update(channels)
    .set({
      position: sql`CASE ${sql.join(
        updates.map(u => sql`WHEN ${channels.id} = ${u.id} THEN ${u.position}`),
        sql` `
      )} END`,
    })
    .where(inArray(channels.id, ids));
}
```

### Verified: Socket.IO Room Join on Connection

```typescript
// Source: https://socket.io/docs/v4/server-socket-instance/ + existing middleware pattern
import { eq } from "drizzle-orm";
import { serverMembers } from "../../db/schema.js";
import { db } from "../../db/client.js";

// In registerConnectionHandlers:
const userId = socket.data.userId; // set by socketAuthMiddleware
await socket.join(`user:${userId}`);

const memberships = await db
  .select({ serverId: serverMembers.serverId })
  .from(serverMembers)
  .where(eq(serverMembers.userId, userId));

for (const { serverId } of memberships) {
  await socket.join(`server:${serverId}`);
}
```

### Verified: dnd-kit useSortable hook (complete API)

```typescript
// Source: https://dndkit.com/presets/sortable
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableItem({ id }: { id: string }) {
  const {
    attributes,     // aria-* and role attributes for accessibility
    listeners,      // onPointerDown, onKeyDown event handlers
    setNodeRef,     // ref callback to attach to the DOM element
    transform,      // { x, y, scaleX, scaleY } during drag
    transition,     // CSS transition string for smooth animation
    isDragging,     // boolean — true while this item is being dragged
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform), // converts to CSS transform string
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {id}
    </div>
  );
}
```

### Verified: Drizzle ORM Transaction Pattern

```typescript
// Source: https://orm.drizzle.team/docs/transactions (existing pattern in codebase)
const result = await db.transaction(async (tx) => {
  const [server] = await tx.insert(servers).values({ name, ownerId: userId }).returning();
  await tx.insert(serverMembers).values({ serverId: server.id, userId });
  await tx.insert(channels).values([
    { serverId: server.id, name: "general", type: "text", position: 0 },
    { serverId: server.id, name: "General", type: "voice", position: 1 },
  ]);
  return server;
});
// If any step throws, the whole transaction rolls back automatically
```

### Verified: Atomic Invite Use Increment

```typescript
// Source: PostgreSQL atomic update pattern (standard SQL)
import { sql, eq } from "drizzle-orm";
import { invites } from "../../db/schema.js";

// Returns the invite if valid and incremented, or empty array if expired/full
const [invite] = await db
  .update(invites)
  .set({ uses: sql`${invites.uses} + 1` })
  .where(
    sql`${invites.code} = ${code}
      AND (${invites.maxUses} IS NULL OR ${invites.uses} < ${invites.maxUses})
      AND (${invites.expiresAt} IS NULL OR ${invites.expiresAt} > NOW())`
  )
  .returning();

if (!invite) {
  return reply.code(410).send({ error: "Invite is expired or has reached its use limit" });
}
```

### Verified: TanStack Query invalidateQueries in Socket.IO listener

```typescript
// Source: https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation
import { useQueryClient } from "@tanstack/react-query";

// In AppShell or a useSocketEvents hook:
const queryClient = useQueryClient();

useEffect(() => {
  const onMemberJoined = ({ serverId }: { serverId: string }) => {
    void queryClient.invalidateQueries({ queryKey: ["servers", serverId, "members"] });
  };

  socket.on("member:joined", onMemberJoined);

  return () => {
    socket.off("member:joined", onMemberJoined); // MUST pass same function reference
  };
}, [queryClient]); // queryClient is stable across renders
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `react-beautiful-dnd` | `@dnd-kit` | 2023 (rbd archived) | dnd-kit is the maintained standard; rbd has open bugs, no React 18/19 support |
| Individual `@radix-ui/react-*` packages | Unified `radix-ui` package | June 2025 (shadcn migration) | The project already uses `radix-ui@1.4.3` (unified) — imports from `radix-ui` not individual packages |
| Manual fetch + `useState` for server data | TanStack Query v5 | 2023+ | TQ v5 has new object-based `useQuery({ queryKey, queryFn })` API — not the old two-positional-args API |
| `react-router-dom v6` with manual `<Switch>` | React Router v7 with `<Routes>` + `<Outlet>` | 2024 | The project already uses react-router-dom v7 (`^7.13.1`) |

**Deprecated/outdated:**
- `react-beautiful-dnd`: Do not use — archived, unmaintained, breaks with React 18+ StrictMode
- TanStack Query v4 API (`useQuery(key, fn, opts)` — three args): v5 uses object API only
- `@radix-ui/react-dialog` (individual package): Project uses unified `radix-ui` package

---

## Open Questions

1. **Should channel categories be stored in the database or derived client-side?**
   - What we know: The schema has `channels.position` and `channels.type`. There is no `categories` table in the schema. The CONTEXT.md says channels are "grouped into collapsible custom categories."
   - What's unclear: Phase 2's "custom categories" feature — are categories a DB entity (requires a new table migration) or just a UI grouping by type ("Text Channels" / "Voice Channels") using existing `channels.type`?
   - Recommendation: **Phase 2 should use type-based grouping only** (text channels under "Text Channels", voice under "Voice Channels") using `channels.type`. The schema does not have a categories table. Adding one is a migration risk. If custom categories are truly needed, it should be scoped to a future enhancement. The CONTEXT.md says "Text Channels" and "Voice Channels" are the default categories for a new server — this strongly implies type-based grouping is sufficient for Phase 2.

2. **How does the new member's socket join the server room after joining via invite?**
   - What we know: `registerConnectionHandlers` joins rooms on connect. New members connect before they've joined the server.
   - What's unclear: Exact mechanism for the client to signal the server to add them to the room after joining.
   - Recommendation: Have the join-invite API emit `server:subscribed` to the joining user's personal room (`user:{userId}`) with the server data. The client listens for `server:subscribed` and navigates to the server. The navigation causes a re-render of `AppShell` which re-fetches the server list. However, the socket room join still needs to happen. Simplest: add a `socket.on("server:subscribe", (serverId) => socket.join(...))` event handler that the client emits after a successful join-via-invite REST call.

3. **Does the schema's `channels` table need a `category_id` or `category_name` column for Phase 2?**
   - What we know: Schema is locked from Phase 1 ("all 11 project tables defined in schema.ts — schema shape locked for all phases"). The 11 tables don't include a categories table.
   - What's unclear: Whether the "collapsible categories" from CONTEXT.md requires a schema change.
   - Recommendation: **Do not add a categories table in Phase 2.** Use `channels.type` as the grouping key for "Text Channels" / "Voice Channels" category headers in the UI. If a future phase adds custom categories, that would require a migration with a new table.

---

## Sources

### Primary (HIGH confidence)
- npm registry (`npm show` command) — verified versions: @dnd-kit/core@6.3.1, @dnd-kit/sortable@10.0.0, @tanstack/react-query@5.90.21, nanoid@5.1.6, zustand@5.0.11
- https://tanstack.com/query/v5/docs/framework/react/quick-start — TanStack Query v5 setup, useQuery, useMutation patterns
- https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation — invalidateQueries API
- https://socket.io/docs/v4/rooms/ — Socket.IO room join/leave/broadcast API
- https://socket.io/docs/v4/server-socket-instance/ — socket.data, socket.join in connection handler
- https://orm.drizzle.team/docs/guides/update-many-with-different-value — bulk update with CASE pattern
- https://orm.drizzle.team/docs/transactions — Drizzle transaction API
- https://dndkit.com/presets/sortable — useSortable hook return values, SortableContext, arrayMove
- https://reactrouter.com/start/declarative/routing — nested routes, Outlet, useParams
- ui.shadcn.com/docs/changelog/2025-06-radix-ui — unified radix-ui package migration (June 2025)
- Codebase inspection: schema.ts, connection.ts, change-password.ts, App.tsx, api.ts, useAuth.tsx

### Secondary (MEDIUM confidence)
- WebSearch: dnd-kit vs react-beautiful-dnd (rbd archived 2023 — multiple sources confirm)
- WebSearch: TanStack Query v5 + Socket.IO integration pattern (confirmed by TQ official query-invalidation docs)
- WebSearch: invite code race condition — atomic UPDATE WHERE pattern (standard SQL, confirmed by logic)

### Tertiary (LOW confidence)
- WebSearch: Color hash from string for avatar initials — `stringToHue` pattern is standard but not from a single authoritative source; the implementation shown is a well-known web pattern
- WebSearch: `socket.on("server:subscribe")` pattern for post-join room membership — plausible but exact Socket.IO pattern is not from official docs; test during implementation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all library versions verified via npm registry; peer deps confirmed
- Architecture patterns: HIGH — based on existing codebase patterns + official docs for each library
- Drag-and-drop: HIGH — dnd-kit official docs confirm useSortable API + arrayMove
- Socket.IO rooms: HIGH — official Socket.IO docs confirm room/broadcast API
- Bulk position update: HIGH — Drizzle official guide confirms CASE statement pattern
- Invite atomicity: HIGH — standard PostgreSQL atomic UPDATE WHERE pattern
- Category question: MEDIUM — recommendation based on schema constraints, but final decision belongs to planner
- Post-join socket room subscription: LOW — recommended pattern is reasonable but needs implementation verification

**Research date:** 2026-02-25
**Valid until:** 2026-03-25 (30 days — all libraries are stable)
