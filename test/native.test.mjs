import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {execFileSync} from "node:child_process"
import {randomUUID} from "node:crypto"
import {fileURLToPath} from "node:url"
import {test} from "node:test"

test("native helper round-trips CFData preferences and rejects stale writes", {skip: process.platform !== "darwin"}, context => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tinycast-native-test-"))
  const domain = `dev.magpie.tinycast.test.${randomUUID()}`
  const executable = path.join(directory, "tinycast-settings-test")
  context.after(() => {
    try { execFileSync("/usr/bin/defaults", ["delete", domain], {stdio: "ignore"}) } catch {}
    fs.rmSync(directory, {recursive: true, force: true})
  })
  const source = fileURLToPath(new URL("../native.swift", import.meta.url))
  execFileSync("/usr/bin/swiftc", ["-D", "TESTING", "-framework", "AppKit", source, "-o", executable], {timeout: 60000})
  const call = request => JSON.parse(execFileSync(executable, [], {input: JSON.stringify(request), encoding: "utf8", env: {...process.env, TINYCAST_TEST_DOMAIN: domain}, timeout: 10000}))
  execFileSync("/usr/bin/defaults", ["write", domain, "untouched", "-string", "keep-this-setting"])
  const original = call({action: "read"})
  assert.equal(original.connectionsPresent, false)
  assert.equal(original.defaultRaw, null)
  const connections = [{id: "74696E79-6361-5374-8D61-677069653031", name: "Magpie", provider: "openAICompatible", baseURL: "http://localhost:3425/v1", models: ["test/model"], visionModels: []}]
  const request = {action: "write", expected: original, connections, defaultRaw: null, remove: false}
  assert.equal(call(request).status, "applied")
  const applied = call({action: "read"})
  assert.deepEqual(applied.connections, connections)
  assert.equal(applied.connectionsPresent, true)
  assert.match(call(request).error, /settings changed/)
  assert.equal(call({action: "write", expected: applied, connections: null, defaultRaw: null, remove: true}).status, "applied")
  assert.equal(call({action: "read"}).connectionsPresent, false)
  assert.equal(execFileSync("/usr/bin/defaults", ["read", domain, "untouched"], {encoding: "utf8"}).trim(), "keep-this-setting")
})
