import { logError } from "@/lib/error-log";

export async function onRequestError(
  error: unknown,
  request: Readonly<{
    path: string;
    method: string;
    headers: NodeJS.Dict<string | string[]>;
  }>,
  context: Readonly<{
    routerKind: "Pages Router" | "App Router";
    routePath: string;
    routeType: "render" | "route" | "action" | "proxy";
    renderSource?: string;
    revalidateReason?: "on-demand" | "stale";
  }>,
): Promise<void> {
  await logError({
    feature: `server.${context.routeType}`,
    path: request.path,
    status: 500,
    error,
    metadata: {
      method: request.method,
      routePath: context.routePath,
      routerKind: context.routerKind,
      renderSource: context.renderSource ?? null,
      revalidateReason: context.revalidateReason ?? null,
    },
  });
}
