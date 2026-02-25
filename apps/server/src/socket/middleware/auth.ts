import type { Socket } from "socket.io";
import { verifyAccessToken } from "../../lib/jwt.js";

// Augment Socket.IO types to include userId on socket.data
declare module "socket.io" {
  interface SocketData {
    userId: string;
  }
}

/**
 * Socket.IO middleware that authenticates connections via JWT.
 * Token must be provided in socket.handshake.auth.token.
 * On success, sets socket.data.userId from the JWT sub claim.
 */
export function socketAuthMiddleware(
  socket: Socket,
  next: (err?: Error) => void
): void {
  const token = socket.handshake.auth?.token as string | undefined;

  if (!token) {
    next(new Error("Authentication required"));
    return;
  }

  verifyAccessToken(token)
    .then((payload) => {
      socket.data.userId = payload.sub as string;
      next();
    })
    .catch(() => {
      next(new Error("Invalid or expired token"));
    });
}
