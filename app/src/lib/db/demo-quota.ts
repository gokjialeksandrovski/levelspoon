import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";

import { DEMO_GUESTS_PER_IP_PER_DAY, DEMO_SCANS_PER_DAY, DEMO_SCANS_PER_IP_PER_DAY } from "@/lib/demo/limits";

import { db, type DbTransaction } from ".";

// A label scan is two OCR calls, product name then nutrition table, so the
// scan counters count calls and their limits are scans times two.
const OCR_CALLS_PER_SCAN = 2;

const UNKNOWN_IP = "unknown";

interface QuotaCounter {
  counter: string;
  limit: number;
}

class QuotaSpentError extends Error {
  constructor(counter: string) {
    super(`Demo quota spent: ${counter}`);
    this.name = "QuotaSpentError";
  }
}

// ponytail: trusts the first x-forwarded-for hop. A reverse proxy in front sets it; a self-host
// with no proxy in front lets a caller pick its own IP, and only the
// all-demo-users scan cap still holds there.
export const clientIp = (headers: Headers): string =>
  headers.get("x-forwarded-for")?.split(",")[0]?.trim() || UNKNOWN_IP;

// Keyed, so a stored counter name can't be reversed to an address by hashing
// all 2^32 IPv4s.
const ipKey = (ip: string): string =>
  createHmac("sha256", process.env.AUTH_SECRET ?? "").update(ip).digest("hex");

// Only bumps a counter still under its limit, so two concurrent requests can't
// both take the last slot.
const bump = async (tx: DbTransaction, { counter, limit }: QuotaCounter): Promise<void> => {
  const result = await tx.execute(sql`
    INSERT INTO demo_quota (day, counter, count) VALUES (current_date, ${counter}, 1)
    ON CONFLICT (day, counter) DO UPDATE SET count = demo_quota.count + 1
    WHERE demo_quota.count < ${limit}
    RETURNING count
  `);
  if (result.rows.length === 0) {
    throw new QuotaSpentError(counter);
  }
};

// All or none: one spent counter rolls back the bumps before it.
const takeQuota = async (counters: QuotaCounter[]): Promise<boolean> => {
  try {
    await db.transaction(async (tx) => {
      for (const counter of counters) {
        await bump(tx, counter);
      }
    });
    return true;
  } catch (error) {
    if (error instanceof QuotaSpentError) {
      return false;
    }
    throw error;
  }
};

export const takeDemoScan = (ip: string): Promise<boolean> =>
  takeQuota([
    { counter: `scan:ip:${ipKey(ip)}`, limit: DEMO_SCANS_PER_IP_PER_DAY * OCR_CALLS_PER_SCAN },
    { counter: "scan:all", limit: DEMO_SCANS_PER_DAY * OCR_CALLS_PER_SCAN },
  ]);

export const takeGuestSignIn = (ip: string): Promise<boolean> =>
  takeQuota([{ counter: `guest:ip:${ipKey(ip)}`, limit: DEMO_GUESTS_PER_IP_PER_DAY }]);
