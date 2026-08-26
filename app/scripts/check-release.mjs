import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appRoot = new URL("../", import.meta.url);
const repoRoot = new URL("../../", import.meta.url);
const read = (base, path) => readFileSync(new URL(path, base), "utf8");

const pkg = JSON.parse(read(appRoot, "package.json"));
const packageLock = JSON.parse(read(appRoot, "package-lock.json"));
const tauri = JSON.parse(read(appRoot, "src-tauri/tauri.conf.json"));
const cargo = read(appRoot, "src-tauri/Cargo.toml");
const cargoLock = read(appRoot, "src-tauri/Cargo.lock");
const changelog = read(repoRoot, "CHANGELOG.md");

const cargoVersion = cargo.match(/^version = "([^"]+)"/m)?.[1];
const lockedAppVersion = cargoLock.match(/name = "app"\r?\nversion = "([^"]+)"/)?.[1];

assert.equal(pkg.version, tauri.version, "package.json and tauri.conf.json versions must match");
assert.equal(pkg.version, cargoVersion, "package.json and Cargo.toml versions must match");
assert.equal(packageLock.version, pkg.version, "package-lock root version must match package.json");
assert.equal(packageLock.packages[""].version, pkg.version, "package-lock app version must match package.json");
assert.equal(lockedAppVersion, pkg.version, "Cargo.lock app version must match package.json");
assert.match(changelog, new RegExp(`^## \\[${pkg.version.replaceAll(".", "\\.")}\\] - \\d{4}-\\d{2}-\\d{2}$`, "m"));
assert.match(changelog, /^## \[0\.0\.1\] - 2026-08-24$/m, "The first public beta must remain documented");

console.log(`PASS: release metadata and changelog agree on Tethys ${pkg.version}.`);
