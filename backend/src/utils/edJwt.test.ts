import { generateKeyPairSync } from "crypto";
import { signJwt, verifyJwt, readKey } from "./edJwt";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const expected = { iss: "a", aud: "b", maxLifetime: 120 };

describe("edJwt", () => {
  test("round trip", () => {
    const t = signJwt({ iss: "a", aud: "b", sub: "s", x: 1 }, privateKey, 60);
    expect(verifyJwt(t, publicKey, expected)).toMatchObject({ sub: "s", x: 1 });
  });

  test("tampering and wrong claims are refused", () => {
    const t = signJwt({ iss: "a", aud: "b", sub: "s" }, privateKey, 60);
    const [h, b, s] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ iss: "a", aud: "b", sub: "admin", iat: 0, exp: 9e9 })).toString("base64url");
    expect(() => verifyJwt(`${h}.${forged}.${s}`, publicKey, expected)).toThrow();
    expect(() => verifyJwt(t, publicKey, { ...expected, aud: "c" })).toThrow();
    expect(() => verifyJwt(t, publicKey, { ...expected, iss: "c" })).toThrow();
    expect(() => verifyJwt(signJwt({ iss: "a", aud: "b", sub: "s" }, privateKey, 600), publicKey, expected)).toThrow();
    const hs = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
    expect(() => verifyJwt(`${hs}.${b}.${s}`, publicKey, expected)).toThrow();
  });

  test("keys from env vars with escaped newlines; non-Ed25519 refused", () => {
    const pem = publicKey.export({ type: "spki", format: "pem" }).toString().replace(/\n/g, "\\n");
    expect(readKey(pem, "public").asymmetricKeyType).toBe("ed25519");
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "pem" }).toString();
    expect(() => readKey(rsa, "public")).toThrow();
  });
});
