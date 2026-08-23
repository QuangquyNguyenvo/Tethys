// Unit tests for terminal link provider regex
import assert from "node:assert/strict";

const PATH_REGEX =
  /(?:[a-zA-Z]:[\\/][^\s:()<>"]+|(?:(?:\.{1,2}[/\\]|[a-zA-Z0-9_.-]+[/\\])*[a-zA-Z0-9_.-]+\.(?:png|jpg|jpeg|svg|webp|gif|ico|bmp|md|markdown|diff|patch|rs|ts|tsx|js|jsx|json|toml|yaml|yml|txt|css|html|go|py|c|cpp|h|log|sh|ps1|bat|cmd)))/gi;

function extractPaths(text) {
  const matches = [];
  let m;
  PATH_REGEX.lastIndex = 0;
  while ((m = PATH_REGEX.exec(text)) !== null) {
    const clean = m[0].replace(/[):,;."']+$/, "");
    if (clean && clean.length >= 2) matches.push(clean);
  }
  return matches;
}

console.log("=== KIEM TRA LINK REGEX (F2) ===");

// Case 1: Windows absolute path
const t1 = "File written to D:\\Code\\Project\\noname\\bench\\throughput.png successfully.";
const p1 = extractPaths(t1);
assert.deepEqual(p1, ["D:\\Code\\Project\\noname\\bench\\throughput.png"]);
console.log("PASS: Windows absolute path ->", p1[0]);

// Case 2: Relative path with file extension
const t2 = "Error at src/pty/session.rs:84:12";
const p2 = extractPaths(t2);
assert.deepEqual(p2, ["src/pty/session.rs"]);
console.log("PASS: Relative source file with line info ->", p2[0]);

// Case 3: Markdown and diff paths
const t3 = "Check [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) and patch.diff";
const p3 = extractPaths(t3);
assert.deepEqual(p3, ["PROJECT_CONTEXT.md", "PROJECT_CONTEXT.md", "patch.diff"]);
console.log("PASS: Markdown links and diffs ->", p3);

// Case 4: Non-path text should not produce false positives
const t4 = "Running cargo test --release with 12 threads";
const p4 = extractPaths(t4);
assert.deepEqual(p4, []);
console.log("PASS: No false positives on normal terminal output");

console.log("\n>>> TAT CA TEST REGEX LINK DEU PASS (F2) <<<");
