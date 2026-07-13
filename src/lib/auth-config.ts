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
import Credentials from "next-auth/providers/credentials";
import type { Provider } from "@auth/core/providers";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "./db";
import { isSameAccountPrincipal } from "./account-principal";
import { clearParentSession, getCurrentParent } from "./parent-session";
import {
  getCanvaReviewerCredentialConfig,
  verifyConfiguredCanvaReviewer,
} from "./canva-reviewer-credentials";
import { extractIp, hashIp } from "./rate-limit";
import { limitCanvaReviewerLogin } from "./rate-limit-routes";

const googleClientId = process.env.AUTH_GOOGLE_ID;
const googleClientSecret = process.env.AUTH_GOOGLE_SECRET;

const providers: Provider[] = [];

if (googleClientId && googleClientSecret) {
  providers.push(
    Google({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

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

const reviewerConfig = getCanvaReviewerCredentialConfig();

if (reviewerConfig) {
  providers.push(
    Credentials({
      id: "canva-reviewer",
      name: "Canva reviewer account",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const email = typeof credentials.email === "string" ? credentials.email : "";
        const password =
          typeof credentials.password === "string" ? credentials.password : "";
        const rateLimit = await limitCanvaReviewerLogin(
          hashIp(extractIp(request)),
          hashIp(email.trim().toLowerCase()),
        );
        if (!rateLimit.ok) return null;

        const verified = verifyConfiguredCanvaReviewer(email, password);
        if (!verified) return null;

        const user = await db.user.findUnique({ where: { email: verified.email } });
        if (!user) return null;
        return { id: user.id, email: user.email, name: user.name, image: user.image };
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
    /**
     * A browser may retain a parent cookie while a teacher signs in. Keep it
     * only if both role sessions resolve to the same email account; otherwise
     * this is an account switch, so revoke the previous parent session.
     */
    async signIn({ user }) {
      const parentContext = await getCurrentParent().catch(() => null);
      if (
        parentContext &&
        !isSameAccountPrincipal(user.email, parentContext.parent.email)
      ) {
        await clearParentSession().catch(() => undefined);
      }
      return true;
    },
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
