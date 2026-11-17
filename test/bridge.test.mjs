import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {test} from "node:test"
import {connect} from "../tinycast.agent.js"
import {CONNECTION_ID, connectionFor, plan, pathsFor, sync} from "../bridge.mjs"

const control = connect({gateway: {v1: "http://127.0.0.1:3425/v1", key: "synthetic-test-key"}, models: [{id: "test/reasoner", images: true, efforts: ["low", "high"], output: 8192}, {id: "test/text"}]})
const original = {connections: [{id: "00000000-0000-4000-8000-000000000001", name: "Personal", models: ["own-model"]}], connectionsPresent: true, defaultRaw: Buffer.from('{"appleIntelligence":{}}').toString("base64"), running: false}

test("maps models, output limits and reasoning while keeping credentials out of preferences", () => {
  const desired = connectionFor(control)
  assert.deepEqual(desired.models, ["test/reasoner", "test/text"])
  assert.deepEqual(desired.visionModels, ["test/reasoner"])
  assert.equal(desired.outputLimits["test/reasoner"], 8192)
  assert.deepEqual(desired.reasoningOptions["test/reasoner"].efforts, ["default", "none", "low", "high"])
  assert.equal(control.apiKey, undefined)
  assert.equal(plan(original, null, control).request.apiKey, undefined)
})

test("rejects all remote gateways and uses Magpie's keyless agent path on localhost", () => {
  for (const v1 of ["http://example.com/v1", "https://example.com/v1", "http://localhost.evil.test/v1", "http://user@localhost/v1"]) assert.throws(() => connect({gateway: {v1}}), /localhost/)
  assert.equal(connectionFor(control).baseURL, "http://127.0.0.1:3425/agent/tinycast/v1")
  assert.equal(connectionFor({...control, baseURL: "http://127.0.0.1:3425/v1", apiKey: "legacy-key"}).baseURL, connectionFor(control).baseURL)
  assert.equal(connect({gateway: {v1: "http://[::1]:3425/v1/"}}).baseURL, "http://[::1]:3425/agent/tinycast/v1")
  assert.throws(() => connectionFor({...control, baseURL: "https://example.com/agent/tinycast/v1"}), /localhost/)
})

test("disconnect preserves other providers and later default choices", () => {
  const added = plan(original, null, control)
  const snapshot = {...original, connections: added.request.connections, defaultRaw: Buffer.from('{"codex":{"model":"new-own-model"}}').toString("base64")}
  const removed = plan(snapshot, added.state, null)
  assert.deepEqual(removed.request.connections, original.connections)
  assert.equal(removed.request.defaultRaw, snapshot.defaultRaw)
})

test("disconnect restores the original default when the user chose Magpie", () => {
  const added = plan(original, null, control)
  const snapshot = {...original, connections: added.request.connections, defaultRaw: Buffer.from(JSON.stringify({api: {connection: CONNECTION_ID, model: "test/text"}})).toString("base64")}
  assert.equal(plan(snapshot, added.state, null).request.defaultRaw, original.defaultRaw)
})

test("retains recovery state for conflicting user edits", () => {
  const added = plan(original, null, control)
  const snapshot = {...original, connections: [original.connections[0], {...connectionFor(control), name: "Edited"}]}
  assert.throws(() => plan(snapshot, added.state, null), /edited in Tinycast/)
})

test("a pending journal can recover both sides of an interrupted connection update", () => {
  const added = plan(original, null, control)
  assert.ok(plan(original, added.pending, control))
  assert.ok(plan({...original, connections: added.request.connections}, added.pending, control))
})

test("disconnect retries after an interrupted preferences update", () => {
  const added = plan(original, null, control)
  const snapshot = {...original, connections: added.request.connections}
  const removed = plan(snapshot, added.state, null)
  const retry = plan(original, removed.pending, null)
  assert.equal(retry.request.remove, true)
  assert.deepEqual(retry.request.connections, original.connections)
})

test("disconnect removes a previously absent connections preference", () => {
  const empty = {...original, connections: [], connectionsPresent: false, defaultRaw: null}
  const added = plan(empty, null, control)
  const removed = plan({...empty, connectionsPresent: true, connections: added.request.connections}, added.state, null)
  assert.equal(removed.request.connections, null)
  assert.equal(removed.request.defaultRaw, null)
})

test("sync waits for Tinycast and restores only its own row after disconnect", context => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "magpie-tinycast-test-"))
  context.after(() => fs.rmSync(home, {recursive: true, force: true}))
  const paths = pathsFor(home)
  fs.mkdirSync(path.dirname(paths.control), {recursive: true})
  fs.writeFileSync(paths.control, JSON.stringify(control))
  let snapshot = {...structuredClone(original), running: true}
  const call = request => {
    if (request.action === "read") return structuredClone(snapshot)
    assert.deepEqual(request.expected, snapshot)
    snapshot = {...snapshot, connections: request.connections ?? [], defaultRaw: request.defaultRaw}
    return {status: "applied"}
  }
  assert.deepEqual(sync(paths, call), {status: "waiting_for_tinycast_to_quit", restartRequired: true, models: 2})
  assert.equal(fs.statSync(paths.control).mode & 0o777, 0o600)
  assert.equal(fs.statSync(path.dirname(paths.control)).mode & 0o777, 0o700)
  assert.equal(fs.existsSync(paths.state), false)
  snapshot.running = false
  assert.equal(sync(paths, call).status, "ready_to_start")
  assert.equal(fs.statSync(paths.state).mode & 0o777, 0o600)
  snapshot.running = true
  assert.equal(sync(paths, call).status, "connected")
  snapshot.running = false
  fs.writeFileSync(paths.control, "{}")
  assert.equal(sync(paths, call).status, "disconnected")
  assert.deepEqual(snapshot.connections, original.connections)
  assert.equal(fs.existsSync(paths.state), false)
})
