import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {execFileSync} from "node:child_process"

if (process.platform !== "darwin") throw new Error("Build the settings helper on macOS with Xcode Command Line Tools.")
const root = fileURLToPath(new URL("../", import.meta.url))
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "tinycast-build-"))
try {
  fs.mkdirSync(path.join(root, "bin"), {recursive: true})
  const slices = ["arm64", "x86_64"].map(architecture => {
    const output = path.join(temporary, architecture)
    execFileSync("/usr/bin/swiftc", ["-O", "-target", `${architecture}-apple-macos13.0`, "-framework", "AppKit", path.join(root, "native.swift"), "-o", output], {stdio: "inherit"})
    return output
  })
  const output = path.join(root, "bin", "tinycast-settings")
  execFileSync("/usr/bin/lipo", ["-create", ...slices, "-output", output], {stdio: "inherit"})
  execFileSync("/usr/bin/codesign", ["--force", "--sign", "-", output], {stdio: "inherit"})
} finally {
  fs.rmSync(temporary, {recursive: true, force: true})
}
