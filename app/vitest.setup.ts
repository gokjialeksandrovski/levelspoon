import { config } from "dotenv";
import { vi } from "vitest";

config({ path: ".env.local" });

// Mutating actions call next/cache's refresh(), which throws outside a Server
// Action request. Tests call the actions directly, so it is a no-op here.
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
