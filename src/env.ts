import { z } from "zod";

const optionalString = z.preprocess((value) => (value === "" ? undefined : value), z.string().optional());

const schema = z.object({
  NEXTAUTH_URL: optionalString.pipe(z.url().optional()),
  NEXTAUTH_SECRET: optionalString,
  ANALYTICS_HASH_SECRET: optionalString,
  DISCORD_CLIENT_ID: optionalString,
  DISCORD_CLIENT_SECRET: optionalString,
  TELEGRAM_BOT_TOKEN: optionalString,
  TELEGRAM_CHAT_ID: optionalString,
  TELEGRAM_WEBHOOK_SECRET: optionalString,
}).superRefine((env, context) => {
  const discord = [env.DISCORD_CLIENT_ID, env.DISCORD_CLIENT_SECRET];
  if (discord.some(Boolean) && !discord.every(Boolean)) context.addIssue({ code: "custom", message: "Set both Discord OAuth values or neither." });
});

export const env = schema.parse(process.env);
