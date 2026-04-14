import type { Express } from "express";
import { isAuthenticated } from "./replitAuth";

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/user", isAuthenticated, (req: any, res) => {
    const { password: _pw, ...safeUser } = req.user;
    res.json(safeUser);
  });

  app.get("/api/auth/config", (_req, res) => {
    res.json({ googleEnabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) });
  });
}
