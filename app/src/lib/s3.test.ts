import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";

import { getPhotoUrl, uploadPhoto } from "./s3";

describe("uploadPhoto", () => {
  it("writes an object retrievable at the given key", async () => {
    const key = `test/${crypto.randomUUID()}.txt`;
    const body = Buffer.from("hello per100");

    await uploadPhoto(key, body, "text/plain");

    const client = new S3Client({
      endpoint: process.env.S3_ENDPOINT!,
      region: "auto",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: true,
    });
    const result = await client.send(
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }),
    );
    const retrieved = await result.Body?.transformToString();

    expect(retrieved).toBe("hello per100");
  });
});

describe("getPhotoUrl", () => {
  it("returns a presigned URL that resolves to the uploaded content", async () => {
    const key = `test/${crypto.randomUUID()}.txt`;
    await uploadPhoto(key, Buffer.from("hello per100"), "text/plain");

    const url = await getPhotoUrl(key);
    const response = await fetch(url);

    expect(response.ok).toBe(true);
    expect(await response.text()).toBe("hello per100");
  });
});
