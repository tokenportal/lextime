import { users, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { eq, count } from "drizzle-orm";

// Interface for auth storage operations
// (IMPORTANT) These user operations are mandatory for Replit Auth.
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // userData.id must be provided for auth
    const userId = userData.id as string;
    
    // Check if this user already exists
    const existingUser = await this.getUser(userId);
    
    // If user exists, just update their info (don't change role)
    if (existingUser) {
      const [user] = await db
        .update(users)
        .set({
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();
      return user;
    }
    
    // New user - check if this is the first user (make them Admin)
    const [userCount] = await db.select({ count: count() }).from(users);
    const isFirstUser = userCount.count === 0;
    
    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        role: isFirstUser ? "Admin" : "Employee",
      })
      .returning();
    return user;
  }
}

export const authStorage = new AuthStorage();
