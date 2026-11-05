// Runs against a real SQLite file through the same migrations production uses.
// Mocked-out persistence is how "no such table" reached a fresh deploy unnoticed.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "interview-db-"));

describe("interview persistence on a freshly migrated database", () => {
  let store: typeof import("./store");

  beforeAll(async () => {
    process.env.DATABASE_URL = path.join(dir, "fresh.db");
    const { migrateDatabase } = await import("../db");
    await migrateDatabase();
    store = await import("./store");
  });

  afterAll(() => {
    delete process.env.DATABASE_URL;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const seed = (workspaceId: string) =>
    store.createMaterial({ workspaceId, userId: 0, kind: "resume", normalizedText: `resume for ${workspaceId}` });

  it("creates every table and round-trips a material", async () => {
    await seed("a");
    expect(await store.listMaterials("a")).toHaveLength(1);
  });

  it("re-applying migrations is a no-op", async () => {
    const { migrateDatabase } = await import("../db");
    await expect(migrateDatabase()).resolves.toBeUndefined();
  });

  it("keeps workspaces apart", async () => {
    await seed("b");
    const rows = await store.getActiveMaterialTexts("b");
    expect(rows.map(r => r.normalizedText)).toEqual(["resume for b"]);
  });

  it("resets approval when a brief is regenerated", async () => {
    await store.upsertBrief({ workspaceId: "c", userId: 0, briefJson: "{}", promptVersion: "t" });
    await store.approveBrief("c");
    expect((await store.getBrief("c"))?.approved).toBe("approved");
    await store.upsertBrief({ workspaceId: "c", userId: 0, briefJson: "{}", promptVersion: "t" });
    expect((await store.getBrief("c"))?.approved).toBe("draft");
  });

  it("deleteWorkspaceData removes that workspace's content and nothing else", async () => {
    await seed("d");
    await store.upsertBrief({ workspaceId: "d", userId: 0, briefJson: "{}", promptVersion: "t" });
    await seed("e");
    await store.deleteWorkspaceData("d");
    expect(await store.listMaterials("d")).toHaveLength(0);
    expect(await store.getBrief("d")).toBeUndefined();
    expect(await store.listMaterials("e")).toHaveLength(1);
  });
});
