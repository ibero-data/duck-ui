/**
 * HTTPFS Feasibility Test Utility
 * Run these tests in browser console to check what works in DuckDB-WASM
 *
 * Usage: Import and call testHttpfsSupport() from browser console
 * Or: Access window.testHttpfs after importing this module
 */

import { useDuckStore } from "@/store";

export interface HttpfsTestResult {
  test: string;
  success: boolean;
  error?: string;
  result?: unknown;
}

export async function testHttpfsSupport(): Promise<HttpfsTestResult[]> {
  const results: HttpfsTestResult[] = [];
  const { connection } = useDuckStore.getState();

  if (!connection) {
    return [{ test: "Connection", success: false, error: "No DuckDB connection available" }];
  }

  console.log("🦆 Starting HTTPFS Feasibility Tests...\n");

  // Test 1: Check available extensions
  try {
    console.log("Test 1: Checking available extensions...");
    const extResult = await connection.query(`
      SELECT extension_name, installed, loaded
      FROM duckdb_extensions()
      WHERE extension_name IN ('httpfs', 'aws', 'azure', 's3')
    `);
    const extensions = extResult.toArray().map((r: { toJSON: () => unknown }) => r.toJSON());
    results.push({
      test: "Available Extensions",
      success: true,
      result: extensions,
    });
    console.log("✅ Extensions check passed:", extensions);
  } catch (e) {
    results.push({
      test: "Available Extensions",
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
    console.log("❌ Extensions check failed:", e);
  }

  // Test 2: Try to INSTALL httpfs
  try {
    console.log("\nTest 2: Installing httpfs...");
    await connection.query(`INSTALL httpfs`);
    results.push({ test: "INSTALL httpfs", success: true });
    console.log("✅ INSTALL httpfs succeeded");
  } catch (e) {
    results.push({
      test: "INSTALL httpfs",
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
    console.log("❌ INSTALL httpfs failed:", e);
  }

  // Test 3: Try to LOAD httpfs
  try {
    console.log("\nTest 3: Loading httpfs...");
    await connection.query(`LOAD httpfs`);
    results.push({ test: "LOAD httpfs", success: true });
    console.log("✅ LOAD httpfs succeeded");
  } catch (e) {
    results.push({
      test: "LOAD httpfs",
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
    console.log("❌ LOAD httpfs failed:", e);
  }

  // Test 4: Check if httpfs functions exist
  try {
    console.log("\nTest 4: Checking httpfs functions...");
    const funcsResult = await connection.query(`
      SELECT function_name
      FROM duckdb_functions()
      WHERE function_name LIKE '%http%' OR function_name LIKE '%s3%'
      LIMIT 10
    `);
    const funcs = funcsResult.toArray().map((r: { toJSON: () => unknown }) => r.toJSON());
    results.push({
      test: "HTTPFS Functions",
      success: funcs.length > 0,
      result: funcs,
    });
    console.log("✅ HTTPFS functions:", funcs);
  } catch (e) {
    results.push({
      test: "HTTPFS Functions",
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
    console.log("❌ HTTPFS functions check failed:", e);
  }

  // Test 5: Try to create a secret (even with dummy values)
  try {
    console.log("\nTest 5: Creating S3 secret...");
    await connection.query(`
      CREATE OR REPLACE SECRET test_s3_secret (
        TYPE s3,
        KEY_ID 'AKIAIOSFODNN7EXAMPLE',
        SECRET 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        REGION 'us-east-1'
      )
    `);
    results.push({ test: "CREATE SECRET (S3)", success: true });
    console.log("✅ CREATE SECRET succeeded");

    // Clean up
    await connection.query(`DROP SECRET IF EXISTS test_s3_secret`);
  } catch (e) {
    results.push({
      test: "CREATE SECRET (S3)",
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
    console.log("❌ CREATE SECRET failed:", e);
  }

  // Test 6: Try to read from a public HTTPS URL (CORS-enabled)
  try {
    console.log("\nTest 6: Reading from HTTPS URL...");
    // Using a known CORS-enabled public parquet file
    const httpsResult = await connection.query(`
      SELECT count(*) as cnt FROM read_parquet('https://shell.duckdb.org/data/tpch/0_01/parquet/lineitem.parquet') LIMIT 1
    `);
    const count = httpsResult.toArray()[0]?.toJSON();
    results.push({
      test: "HTTPS URL Read",
      success: true,
      result: count,
    });
    console.log("✅ HTTPS URL read succeeded:", count);
  } catch (e) {
    results.push({
      test: "HTTPS URL Read",
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
    console.log("❌ HTTPS URL read failed:", e);
  }

  // Test 7: Try to read from S3 URL (likely to fail due to CORS)
  try {
    console.log("\nTest 7: Reading from S3 URL...");
    // This will likely fail in browser due to CORS
    const s3Result = await connection.query(`
      SELECT count(*) as cnt FROM read_parquet('s3://test-bucket/test.parquet') LIMIT 1
    `);
    const count = s3Result.toArray()[0]?.toJSON();
    results.push({
      test: "S3 URL Read",
      success: true,
      result: count,
    });
    console.log("✅ S3 URL read succeeded:", count);
  } catch (e) {
    results.push({
      test: "S3 URL Read",
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
    console.log("⚠️ S3 URL read failed (expected in browser):", e);
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 HTTPFS FEASIBILITY TEST SUMMARY");
  console.log("=".repeat(50));

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  results.forEach((r) => {
    const icon = r.success ? "✅" : "❌";
    console.log(`${icon} ${r.test}: ${r.success ? "PASS" : "FAIL"}`);
    if (r.error) console.log(`   Error: ${r.error}`);
  });

  console.log("=".repeat(50));
  console.log(`Total: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(50));

  return results;
}

// Expose to window for easy console access
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).testHttpfs = testHttpfsSupport;
}

export default testHttpfsSupport;
