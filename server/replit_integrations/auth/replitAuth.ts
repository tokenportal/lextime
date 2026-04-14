import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import session from "express-session";
import connectPg from "connect-pg-simple";
import type { Express, RequestHandler } from "express";
import { db } from "../../db";
import { users } from "@shared/models/auth";
import { eq, count } from "drizzle-orm";
import crypto from "crypto";

export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [salt, key] = hash.split(":");
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(key === derivedKey.toString("hex"));
    });
  });
}

async function findOrCreateGoogleUser(googleId: string, email: string, firstName: string, lastName: string, profileImageUrl: string) {
  // Try to find by email first (handles existing users who previously used email/password)
  const [existingByEmail] = await db.select().from(users).where(eq(users.email, email));
  if (existingByEmail) {
    // Update profile info from Google
    const [updated] = await db
      .update(users)
      .set({ firstName, lastName, profileImageUrl, updatedAt: new Date() })
      .where(eq(users.id, existingByEmail.id))
      .returning();
    return updated;
  }

  // New user — first user becomes Admin
  const [userCount] = await db.select({ count: count() }).from(users);
  const isFirstUser = userCount.count === 0;

  const [newUser] = await db
    .insert(users)
    .values({
      id: googleId,
      email,
      firstName,
      lastName,
      profileImageUrl,
      role: isFirstUser ? "Admin" : "Employee",
    })
    .returning();
  return newUser;
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000;
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: sessionTtl,
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // --- Local (email/password) strategy ---
  passport.use(
    new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
      try {
        const [user] = await db.select().from(users).where(eq(users.email, email));
        if (!user) return done(null, false, { message: "Invalid email or password" });
        if (!user.password) return done(null, false, { message: "No password set — use Google sign-in or contact an admin" });
        const valid = await verifyPassword(password, user.password);
        if (!valid) return done(null, false, { message: "Invalid email or password" });
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );

  // --- Google OAuth strategy (only if credentials are configured) ---
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const callbackURL = process.env.NODE_ENV === "production"
      ? `${process.env.APP_URL}/api/auth/google/callback`
      : "http://localhost:5000/api/auth/google/callback";

    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value ?? "";
            const firstName = profile.name?.givenName ?? "";
            const lastName = profile.name?.familyName ?? "";
            const profileImageUrl = profile.photos?.[0]?.value ?? "";
            const user = await findOrCreateGoogleUser(profile.id, email, firstName, lastName, profileImageUrl);
            return done(null, user);
          } catch (err) {
            return done(err as Error);
          }
        }
      )
    );

    app.get("/api/auth/google", passport.authenticate("google", { scope: ["openid", "email", "profile"] }));

    app.get(
      "/api/auth/google/callback",
      passport.authenticate("google", { failureRedirect: "/login" }),
      (req, res) => res.redirect("/")
    );
  }

  passport.serializeUser((user: any, cb) => cb(null, user.id));
  passport.deserializeUser(async (id: string, cb) => {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      cb(null, user || null);
    } catch (err) {
      cb(err);
    }
  });

  // --- Local login endpoint ---
  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Invalid credentials" });
      req.logIn(user, (err) => {
        if (err) return next(err);
        const { password: _pw, ...safeUser } = user;
        res.json(safeUser);
      });
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect("/");
    });
  });
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ message: "Unauthorized" });
};
