import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { isDraft } from "@/lib/problem";
import { STORAGE_MODES } from "@/lib/types";
import { CONTRACT_V1, CONTRACT_V1_1, readContractJson } from "./helpers/contract";

/**
 * Contract v1 is FROZEN and contract v1.1 is an additive copy of it (v1.1 adds only the storage_mode
 * value "postgres"). These tests read both folders and never write to either.
 */

const CONTRACTS = resolve(process.cwd(), "..", "contracts");
const V1_DIR = join(CONTRACTS, CONTRACT_V1);
const V11_DIR = join(CONTRACTS, CONTRACT_V1_1);

/** Recorded when v1.1 was created. If this changes, someone edited the frozen v1 folder. */
const V1_FILE_COUNT = 19;
const V1_DIGEST = "09f6a0d24fa716bcacb03f79de3ee92d001e48ea164ff1d4da3a6a60e95e626c";

function listFiles(directory: string): string[] {
  return (readdirSync(directory, { recursive: true }) as string[])
    .map((entry) => entry.split(sep).join("/"))
    .filter((entry) => statSync(join(directory, entry)).isFile())
    .sort();
}

/** SHA-256 over every file's relative path and bytes, in sorted order. */
function digest(directory: string): string {
  const hash = createHash("sha256");
  for (const file of listFiles(directory)) {
    hash.update(`${file}\0`);
    hash.update(readFileSync(join(directory, file)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

const bytes = (directory: string, file: string) => readFileSync(join(directory, file));

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const v1 = <T = Json>(file: string) => readContractJson<T>(file, CONTRACT_V1);
const v11 = <T = Json>(file: string) => readContractJson<T>(file, CONTRACT_V1_1);

describe("contract v1 is still exactly as approved", () => {
  it("has the same 19 files with the recorded digest", () => {
    expect(listFiles(V1_DIR)).toHaveLength(V1_FILE_COUNT);
    expect(digest(V1_DIR)).toBe(V1_DIGEST);
  });

  it("still allows only the single value in_memory_dev for storage_mode", () => {
    expect(v1("schemas/purchase-request-draft.response.schema.json").properties.storage_mode.const).toBe("in_memory_dev");
    expect(v1("schemas/health.response.schema.json").properties.storage_mode).toEqual({ const: "in_memory_dev" });
    expect(v1("examples/create-response.201.json").storage_mode).toBe("in_memory_dev");
    expect(v1("examples/health.200.json").storage_mode).toBe("in_memory_dev");
  });
});

describe("contract v1.1 is an additive copy of v1", () => {
  const v1Files = listFiles(V1_DIR);
  const v11Files = listFiles(V11_DIR);

  it("contains every v1 file and exactly two new examples", () => {
    expect(v1Files.filter((file) => !v11Files.includes(file))).toEqual([]);
    expect(v11Files.filter((file) => !v1Files.includes(file))).toEqual([
      "examples/create-response.201.postgres.json",
      "examples/health.200.postgres.json",
    ]);
  });

  it("differs from v1 in exactly three files; every other file is a byte-for-byte copy", () => {
    const changed = v1Files.filter((file) => !bytes(V1_DIR, file).equals(bytes(V11_DIR, file)));
    expect(changed).toEqual([
      "README.md",
      "schemas/health.response.schema.json",
      "schemas/purchase-request-draft.response.schema.json",
    ]);
  });

  it("keeps the request side, the error side and the messages exactly as v1", () => {
    for (const file of [
      "schemas/create-purchase-request.request.schema.json",
      "schemas/problem.schema.json",
      "messages.json",
      "examples/cases.json",
      "examples/create-request.valid.json",
      "examples/create-request.invalid.json",
      "examples/create-response.201.json",
      "examples/health.200.json",
    ]) {
      expect(bytes(V11_DIR, file).equals(bytes(V1_DIR, file)), file).toBe(true);
    }
    for (const file of v1Files.filter((name) => name.startsWith("examples/error."))) {
      expect(bytes(V11_DIR, file).equals(bytes(V1_DIR, file)), file).toBe(true);
    }
  });

  it("the draft response schema changes only $id, the id description and storage_mode", () => {
    const strip = (schema: Json) => {
      const copy = structuredClone(schema);
      delete copy.$id;
      delete copy.properties.id.description;
      delete copy.properties.storage_mode;
      return copy;
    };
    const before = v1("schemas/purchase-request-draft.response.schema.json");
    const after = v11("schemas/purchase-request-draft.response.schema.json");
    expect(strip(after)).toEqual(strip(before));
    expect(after.$id).toContain("purchase-request-v1.1");
    expect(after.properties.storage_mode.enum).toEqual([...STORAGE_MODES]);
    expect(after.properties.storage_mode).not.toHaveProperty("const");
    expect(after.additionalProperties).toBe(false); // still no extra fields, so no approval or order field can sneak in
    expect(after.properties.status).toEqual({ const: "draft" });
  });

  it("the health schema changes only $id and storage_mode", () => {
    const strip = (schema: Json) => {
      const copy = structuredClone(schema);
      delete copy.$id;
      delete copy.properties.storage_mode;
      return copy;
    };
    const before = v1("schemas/health.response.schema.json");
    const after = v11("schemas/health.response.schema.json");
    expect(strip(after)).toEqual(strip(before));
    expect(after.$id).toContain("purchase-request-v1.1");
    expect(after.properties.storage_mode).toEqual({ enum: [...STORAGE_MODES] });
  });

  it("the client's list of storage modes is exactly the v1.1 enum, in the same order", () => {
    expect([...STORAGE_MODES]).toEqual(["in_memory_dev", "postgres"]);
  });

  it("the postgres examples equal the v1 examples except for storage_mode", () => {
    expect(v11("examples/create-response.201.postgres.json")).toEqual({
      ...v1("examples/create-response.201.json"),
      storage_mode: "postgres",
    });
    expect(v11("examples/health.200.postgres.json")).toEqual({
      ...v1("examples/health.200.json"),
      storage_mode: "postgres",
    });
  });

  it("the new and changed files hold no connection string, credential, e-mail address or personal path", () => {
    // Only the files that v1.1 adds or changes. The byte-copies are guarded by the tests above.
    const own = [
      "README.md",
      "schemas/purchase-request-draft.response.schema.json",
      "schemas/health.response.schema.json",
      "examples/create-response.201.postgres.json",
      "examples/health.200.postgres.json",
    ];
    const forbidden = [
      /postgres(ql)?:\/\//i, // a connection string
      /BEGIN [A-Z ]*PRIVATE KEY/,
      /\b(password|passwd|secret|token|api[_-]?key)["']?\s*[:=]/i, // a credential being assigned
      /Bearer\s+[A-Za-z0-9._-]{16,}/,
      /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/, // an e-mail address
      /[A-Za-z]:\\Users\\|\/Users\/|\/home\/[a-z]/i, // a personal path
    ];
    for (const file of own) {
      const text = readFileSync(join(V11_DIR, file), "utf8");
      for (const pattern of forbidden) expect(text, `${file} ${pattern}`).not.toMatch(pattern);
    }
  });
});

describe("this client accepts both contract versions and nothing else", () => {
  const inMemory = () => v1("examples/create-response.201.json");
  const postgres = () => v11("examples/create-response.201.postgres.json");

  it("accepts the v1 example and the v1.1 postgres example", () => {
    expect(isDraft(inMemory())).toBe(true);
    expect(isDraft(postgres())).toBe(true);
  });

  it.each(["", "postgres ", " postgres", "POSTGRES", "Postgres", "memory", "in_memory", "in-memory-dev", "sqlite", "postgresql"])(
    "rejects the storage_mode %j",
    (value) => {
      expect(isDraft({ ...postgres(), storage_mode: value })).toBe(false);
      expect(isDraft({ ...inMemory(), storage_mode: value })).toBe(false);
    },
  );

  it.each([null, 0, 1, true, {}, [], ["postgres"]])("rejects a storage_mode that is not a string: %j", (value) => {
    expect(isDraft({ ...postgres(), storage_mode: value })).toBe(false);
  });

  it("rejects a draft without storage_mode", () => {
    const draft = postgres();
    delete draft.storage_mode;
    expect(isDraft(draft)).toBe(false);
  });

  it("still rejects extra fields, also with the postgres value (no approval or order field may appear)", () => {
    for (const extra of ["approved", "purchase_order", "supplier", "status_history"]) {
      expect(isDraft({ ...postgres(), [extra]: true }), extra).toBe(false);
      expect(isDraft({ ...inMemory(), [extra]: true }), extra).toBe(false);
    }
  });

  it("still requires the status draft, with either storage_mode", () => {
    expect(isDraft({ ...postgres(), status: "approved" })).toBe(false);
    expect(isDraft({ ...postgres(), status: "released" })).toBe(false);
  });
});
