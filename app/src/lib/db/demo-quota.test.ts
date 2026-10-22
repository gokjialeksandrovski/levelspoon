import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { DEMO_GUESTS_PER_IP_PER_DAY, DEMO_SCANS_PER_IP_PER_DAY } from "@/lib/demo/limits";

import { db } from ".";
import { clientIp, takeDemoScan, takeGuestSignIn } from "./demo-quota";

const OCR_CALLS_PER_IP = DEMO_SCANS_PER_IP_PER_DAY * 2;

const takeTimes = async (times: number, take: () => Promise<boolean>): Promise<boolean[]> => {
  const results: boolean[] = [];
  for (let call = 0; call < times; call += 1) {
    results.push(await take());
  }
  return results;
};

beforeEach(async () => {
  await db.execute(sql`TRUNCATE TABLE demo_quota`);
});

describe("takeDemoScan", () => {
  it("allows each IP its daily OCR calls, then refuses", async () => {
    const results = await takeTimes(OCR_CALLS_PER_IP + 1, () => takeDemoScan("203.0.113.7"));
    expect(results.slice(0, OCR_CALLS_PER_IP).every(Boolean)).toBe(true);
    expect(results.at(-1)).toBe(false);
  });

  it("does not charge the all-users counter for a refused call", async () => {
    await takeTimes(OCR_CALLS_PER_IP + 3, () => takeDemoScan("203.0.113.7"));
    const result = await db.execute<{ count: number }>(sql`SELECT count FROM demo_quota WHERE counter = 'scan:all'`);
    expect(result.rows[0].count).toBe(OCR_CALLS_PER_IP);
  });

  it("counts IPs apart", async () => {
    await takeTimes(OCR_CALLS_PER_IP, () => takeDemoScan("203.0.113.7"));
    expect(await takeDemoScan("198.51.100.2")).toBe(true);
  });
});

describe("takeGuestSignIn", () => {
  it("allows each IP its daily demo starts, then refuses", async () => {
    const results = await takeTimes(DEMO_GUESTS_PER_IP_PER_DAY + 1, () => takeGuestSignIn("203.0.113.7"));
    expect(results).toEqual([...Array<boolean>(DEMO_GUESTS_PER_IP_PER_DAY).fill(true), false]);
  });
});

describe("clientIp", () => {
  it("takes the first forwarded hop", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });
});
