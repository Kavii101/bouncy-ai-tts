import { describe, expect, it } from "vitest";
import { assertReadOnlySql, checkReadOnlySql } from "./sql-engine";

describe("SQL read-only safety gate", () => {
  it("accepts a plain SELECT", () => {
    const r = checkReadOnlySql("SELECT id, name FROM users WHERE active = 1");
    expect(r.ok).toBe(true);
  });

  it("accepts a WITH/CTE that selects", () => {
    const r = checkReadOnlySql("WITH recent AS (SELECT * FROM orders WHERE created_at > '2026-01-01') SELECT count(*) FROM recent");
    expect(r.ok).toBe(true);
  });

  it("accepts a parenthesized subquery select", () => {
    expect(checkReadOnlySql("(SELECT 1)").ok).toBe(true);
  });

  it("rejects empty input", () => {
    expect(checkReadOnlySql("   ").ok).toBe(false);
  });

  it.each([
    ["DROP", "DROP TABLE users"],
    ["DELETE", "DELETE FROM users WHERE id = 1"],
    ["UPDATE", "UPDATE users SET admin = 1 WHERE id = 1"],
    ["INSERT", "INSERT INTO users (name) VALUES ('x')"],
    ["TRUNCATE", "TRUNCATE TABLE users"],
    ["ALTER", "ALTER TABLE users ADD COLUMN x int"],
    ["CREATE", "CREATE TABLE t (id int)"],
    ["GRANT", "GRANT ALL ON users TO bob"],
    ["MERGE", "MERGE INTO t USING s ON t.id = s.id WHEN MATCHED THEN UPDATE SET t.x = s.x"],
  ])("rejects a %s statement", (_label, sql) => {
    const r = checkReadOnlySql(sql);
    expect(r.ok).toBe(false);
  });

  it("rejects a CTE whose body mutates", () => {
    expect(checkReadOnlySql("WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x").ok).toBe(false);
  });

  it("rejects multiple statements", () => {
    expect(checkReadOnlySql("SELECT 1; SELECT 2").ok).toBe(false);
  });

  it("rejects a statement hidden after a line comment", () => {
    const r = checkReadOnlySql("SELECT 1; -- harmless\nDROP TABLE users");
    expect(r.ok).toBe(false);
  });

  it("rejects a statement separator smuggled via a string literal", () => {
    // The `;` and DROP are OUTSIDE the quoted literal here — a naive split on
    // the first `;` must not be fooled into treating this as one SELECT.
    const r = checkReadOnlySql("SELECT 'a'; DROP TABLE users");
    expect(r.ok).toBe(false);
  });

  it("does NOT false-positive on keywords inside string literals", () => {
    const r = checkReadOnlySql("SELECT 'please update the report' AS note FROM dual");
    expect(r.ok).toBe(true);
  });

  it("does NOT false-positive on a block comment containing a verb", () => {
    expect(checkReadOnlySql("SELECT 1 /* do not DROP this */").ok).toBe(true);
  });

  it.each([
    "SELECT load_file('/etc/passwd')",
    "SELECT pg_read_file('/etc/passwd')",
    "SELECT * FROM users INTO OUTFILE '/tmp/x'",
    "SELECT pg_sleep(10)",
    "SELECT * FROM openrowset('x','y','z')",
  ])("rejects file/network/shell functions: %s", sql => {
    expect(checkReadOnlySql(sql).ok).toBe(false);
  });

  it("rejects anything that does not begin with SELECT/WITH", () => {
    expect(checkReadOnlySql("EXPLAIN SELECT 1").ok).toBe(false);
    expect(checkReadOnlySql("SET search_path = evil").ok).toBe(false);
  });

  it("assertReadOnlySql throws on rejection and returns the statement on success", () => {
    expect(() => assertReadOnlySql("DROP TABLE t")).toThrow(/SQL_REJECTED/);
    expect(assertReadOnlySql("SELECT 1")).toContain("SELECT 1");
  });
});
