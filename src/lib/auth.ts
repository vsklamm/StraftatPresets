import type { NextAuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";
import { AUTH_SESSION_MAX_AGE_SECONDS } from "@/src/domain/preset-policy";
import { env } from "@/src/env";
import { getApplicationServices } from "@/src/infrastructure/runtime";

export const authOptions: NextAuthOptions = {
  secret: env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: AUTH_SESSION_MAX_AGE_SECONDS },
  jwt: { maxAge: AUTH_SESSION_MAX_AGE_SECONDS },
  providers: [DiscordProvider({
    clientId: env.DISCORD_CLIENT_ID ?? "discord-not-configured",
    clientSecret: env.DISCORD_CLIENT_SECRET ?? "discord-not-configured",
    authorization: { params: { scope: "identify" } },
  })],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "discord") return false;
      const { repository } = await getApplicationServices();
      const storedUser = await repository.upsertDiscordUser(account.providerAccountId, user.name ?? "Discord user");
      return storedUser.isActive;
    },
    async jwt({ token, account }) {
      if (account?.provider === "discord") token.discordId = account.providerAccountId;
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.discordId === "string") session.user.id = token.discordId;
      return session;
    },
  },
};
