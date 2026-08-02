import "server-only";

/**
 * Shadow Alliance authority moved to the Rust play engine.
 *
 * Keep this module as an intentionally empty compatibility boundary so stale
 * imports fail during review instead of silently creating a second state
 * machine in Next/Prisma. Live routes must use playEngineFetch.
 */
export {};
