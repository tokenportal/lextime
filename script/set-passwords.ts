/**
 * One-time script to set initial passwords for existing users.
 * Run with: npx tsx script/set-passwords.ts
 */
import crypto from "crypto";
import pg from "pg";

const { Client } = pg;

async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

const passwords: Record<string, string> = {
  "yuriy.sherayzen@gmail.com": "Sherlaw2024!",
  "eisenlearning@gmail.com": "Sherlaw2024!",
};

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/lextime",
  });
  await client.connect();

  for (const [email, plainPassword] of Object.entries(passwords)) {
    const hash = await hashPassword(plainPassword);
    await client.query("UPDATE users SET password = $1 WHERE email = $2", [hash, email]);
    console.log(`✓ Password set for ${email}`);
  }

  await client.end();
  console.log("Done.");
}

main().catch(console.error);
