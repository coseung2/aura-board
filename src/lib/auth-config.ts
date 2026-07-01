/**
 * Auth.js v5 configuration.
 *
 * Teacher OAuth + Prisma adapter + JWT session strategy.
 * Env vars: AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, AUTH_SECRET
 * Kakao reuses the parent OAuth app credentials:
 * KAKAO_PARENT_CLIENT_ID, KAKAO_PARENT_CLIENT_SECRET
 */
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Kakao, { type KakaoProfile } from "next-auth/providers/kakao";
import type { Provider } from "@auth/core/providers";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "./db";

const providers: Provider[] = [Google];

const kakaoClientId = process.env.KAKAO_PARENT_CLIENT_ID ?? process.env.AUTH_KAKAO_ID;
const kakaoClientSecret =
  process.env.KAKAO_PARENT_CLIENT_SECRET ?? process.env.AUTH_KAKAO_SECRET;

if (kakaoClientId && kakaoClientSecret) {
  providers.push(
    Kakao<KakaoProfile>({
      clientId: kakaoClientId,
      clientSecret: kakaoClientSecret,
      allowDangerousEmailAccountLinking: true,
      profile(profile) {
        const account = profile.kakao_account;
        const emailVerified =
          !!account?.email &&
          !!account.is_email_valid &&
          !!account.is_email_verified;

        return {
          id: profile.id.toString(),
          name: account?.profile?.nickname,
          email: emailVerified ? account?.email : null,
          image: account?.profile?.profile_image_url,
        };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  providers,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
