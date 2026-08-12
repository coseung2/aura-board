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
import Apple from "next-auth/providers/apple";
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
import {
  limitCanvaReviewerLogin,
  limitPasswordLogin,
} from "./rate-limit-routes";
import {
  normalizePasswordUsername,
  verifyPasswordCredential,
} from "./password-credentials";

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
      // Shared/classroom devices: always show the Kakao account chooser so a
      // different person can pick (or add) their own Kakao account instead of
      // being auto-logged-in with the previous browser Kakao session.
      authorization: {
        // The built-in Kakao provider declares its authorization URL as a
        // string; object form must repeat it or Auth.js drops the URL and
        // fails with `TypeError: Invalid URL` at sign-in time.
        url: "https://kauth.kakao.com/oauth/authorize?scope",
        params: { prompt: "select_account" },
      },
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

const appleClientId = process.env.AUTH_APPLE_ID?.trim();
const appleClientSecret = process.env.AUTH_APPLE_SECRET?.trim();

if (appleClientId && appleClientSecret) {
  providers.push(
    Apple({
      clientId: appleClientId,
      clientSecret: appleClientSecret,
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

providers.push(
  Credentials({
    id: "password",
    name: "Aura Board username and password",
    credentials: {
      username: { label: "ID", type: "text" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials, request) {
      const username = normalizePasswordUsername(
        typeof credentials.username === "string" ? credentials.username : "",
      );
      const password =
        typeof credentials.password === "string" ? credentials.password : "";
      const rateLimit = await limitPasswordLogin(
        hashIp(extractIp(request)),
        hashIp(username),
      );
      if (!rateLimit.ok) return null;

      const verified = await verifyPasswordCredential(username, password);
      if (!verified) return null;
      const user = await db.user.findUnique({
        where: { email: verified.principalEmail },
      });
      if (!user) return null;
      return { id: user.id, email: user.email, name: user.name, image: user.image };
    },
  }),
);

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
  // An empty local AUTH_URL prevents Auth.js v5 from inferring its normal
  // development host trust. Trust localhost/127.0.0.1 only in development;
  // production keeps Auth.js's default host validation.
  ...(process.env.NODE_ENV === "development" ? { trustHost: true } : {}),
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
    async signIn({ user, account, profile }) {
      if (
        account?.provider === "google" &&
        (profile as { email_verified?: unknown } | undefined)?.email_verified !== true
      ) {
        return false;
      }
      const parentContext = await getCurrentParent().catch(() => null);
      if (
        parentContext &&
        !isSameAccountPrincipal(user.email, parentContext.parent.email)
      ) {
        await clearParentSession().catch(() => undefined);
      }
      return true;
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        if (typeof user.name === "string" && user.name.trim()) {
          token.name = user.name.trim();
        }
      }

      // Sign-in seeds the display name and the nickname editor calls
      // `session.update`. Avoid re-reading User on every JWT/session lookup;
      // only repair legacy/missing names once. Authenticated server routes load
      // the authoritative User row separately.
      if (trigger === "update" && session && typeof (session as { name?: unknown }).name === "string") {
        const nextName = String((session as { name?: string }).name ?? "").trim();
        if (nextName) token.name = nextName;
      } else if (
        token.id &&
        (typeof token.name !== "string" || !token.name.trim())
      ) {
        const dbUser = await db.user.findUnique({
          where: { id: String(token.id) },
          select: { name: true },
        });
        if (dbUser?.name?.trim()) token.name = dbUser.name.trim();
      }

      return token;
    },
    session({ session, token }) {
      if (token.id) {
        session.user.id = token.id as string;
      }
      if (typeof token.name === "string" && token.name.trim()) {
        session.user.name = token.name.trim();
      }
      return session;
    },
  },
});
