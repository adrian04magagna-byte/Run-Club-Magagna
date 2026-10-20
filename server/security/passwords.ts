import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const COST = 32_768;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const MAX_MEMORY = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, cost: number, blockSize: number, parallelism: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      KEY_LENGTH,
      { N: cost, r: blockSize, p: parallelism, maxmem: MAX_MEMORY },
      (error, key) => (error ? reject(error) : resolve(key as Buffer)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, COST, BLOCK_SIZE, PARALLELISM);
  return ["scrypt", COST, BLOCK_SIZE, PARALLELISM, salt.toString("hex"), key.toString("hex")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, rawCost, rawBlockSize, rawParallelism, saltHex, keyHex] = stored.split("$");
  if (algorithm !== "scrypt" || !rawCost || !rawBlockSize || !rawParallelism || !saltHex || !keyHex) {
    return false;
  }

  const cost = Number(rawCost);
  const blockSize = Number(rawBlockSize);
  const parallelism = Number(rawParallelism);
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(keyHex, "hex");
  if (!Number.isSafeInteger(cost) || salt.length !== 16 || expected.length !== KEY_LENGTH) return false;
  if (![16_384, 32_768, 65_536].includes(cost) || blockSize !== 8 || parallelism !== 1) return false;

  const actual = await derive(password, salt, cost, blockSize, parallelism);
  return timingSafeEqual(actual, expected);
}
