import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const REQUIRED_ENV_VARS = [
  "S3_ENDPOINT",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_BUCKET",
] as const;

const readRequiredEnv = (name: (typeof REQUIRED_ENV_VARS)[number]): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const endpoint = readRequiredEnv("S3_ENDPOINT");
const accessKeyId = readRequiredEnv("S3_ACCESS_KEY_ID");
const secretAccessKey = readRequiredEnv("S3_SECRET_ACCESS_KEY");
const bucket = readRequiredEnv("S3_BUCKET");
const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === "true";

const client = new S3Client({
  endpoint,
  region: "auto",
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle,
});

export const uploadPhoto = async (
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> => {
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
  );
};

const PHOTO_URL_EXPIRY_SECONDS = 300; // long enough for one page view, short enough to limit exposure

export const getPhotoUrl = async (key: string): Promise<string> =>
  getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: PHOTO_URL_EXPIRY_SECONDS,
  });
