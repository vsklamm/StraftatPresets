import { existsSync } from "node:fs";

const environmentFile = process.argv[2];
if (environmentFile) {
  if (!existsSync(environmentFile)) throw new Error(`Missing ${environmentFile}`);
  process.loadEnvFile(environmentFile);
}

const errors = [];
const url = process.env.NEXTAUTH_URL;
const secret = process.env.NEXTAUTH_SECRET;
if (!url) errors.push("NEXTAUTH_URL is required.");
else {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") errors.push("NEXTAUTH_URL must use HTTPS outside local development.");
}
if (!secret || secret.length < 32) errors.push("NEXTAUTH_SECRET must contain at least 32 characters.");
if (!process.env.DISCORD_CLIENT_ID) errors.push("DISCORD_CLIENT_ID is required.");
if (!process.env.DISCORD_CLIENT_SECRET) errors.push("DISCORD_CLIENT_SECRET is required.");
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("Production environment looks valid.");
