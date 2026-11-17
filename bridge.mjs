import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {execFileSync} from "node:child_process"
import {randomUUID} from "node:crypto"
import {isDeepStrictEqual} from "node:util"

export const CONNECTION_ID = "74696E79-6361-5374-8D61-677069653031"
export const DOMAIN = "com.abueammar.tinycast"
const root = path.dirname(fileURLToPath(import.meta.url))

export function pathsFor(home = os.homedir()) {
  const directory = path.join(home, ".config", "magpie-tinycast")
  return {control: path.join(directory, "connection.json"), state: path.join(directory, "state.json"), status: path.join(directory, "status.json"), lock: path.join(directory, "sync.lock")}
}

function read(file) {
  try {
    const info = fs.lstatSync(file)
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("A bridge file is not a regular file.")
    fs.chmodSync(file, 0o600)
    return JSON.parse(fs.readFileSync(file, "utf8"))
  } catch (error) {
    if (error.code === "ENOENT") return null
    throw error
  }
}

function privateDirectory(directory) {
  fs.mkdirSync(directory, {recursive: true, mode: 0o700})
  if (!fs.lstatSync(directory).isDirectory()) throw new Error("The bridge directory is not a regular directory.")
  fs.chmodSync(directory, 0o700)
}

function write(file, value) {
  privateDirectory(path.dirname(file))
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", {mode: 0o600, flag: "wx"})
    fs.renameSync(temporary, file)
  } finally {
    fs.rmSync(temporary, {force: true})
  }
}

export function connectionFor(control) {
  if (control.enabled !== true || !control.baseURL || !Array.isArray(control.models)) throw new Error("Invalid Tinycast connection settings.")
  const endpoint = new URL(control.baseURL)
  if (!["http:", "https:"].includes(endpoint.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error("Tinycast's keyless integration requires a localhost gateway.")
  if (["/v1", "/v1/"].includes(endpoint.pathname)) endpoint.pathname = "/agent/tinycast/v1"
  if (endpoint.pathname !== "/agent/tinycast/v1") throw new Error("Unsupported Magpie agent endpoint.")
  const baseURL = endpoint.href
  const connection = {id: CONNECTION_ID, name: "Magpie", provider: "openAICompatible", baseURL, models: [], visionModels: [], reasoningOptions: {}, outputLimits: {}}
  for (const model of control.models) {
    if (!model || typeof model.id !== "string" || !model.id || connection.models.includes(model.id)) continue
    connection.models.push(model.id)
    if (model.images) connection.visionModels.push(model.id)
    if (Number.isSafeInteger(model.output) && model.output > 0) connection.outputLimits[model.id] = model.output
    const levels = (model.efforts || []).filter(effort => ["minimal", "low", "medium", "high", "xhigh", "max"].includes(effort))
    if (levels.length) connection.reasoningOptions[model.id] = {efforts: ["default", "none", ...new Set(levels)], defaultEffort: "default"}
  }
  return connection
}

export function plan(snapshot, state, control) {
  const current = snapshot.connections.find(connection => connection.id.toUpperCase() === CONNECTION_ID) ?? null
  if (state && (state.version !== 1 || state.domain !== DOMAIN || !Array.isArray(state.allowed))) throw new Error("Invalid recovery state; retain state.json for inspection.")
  if (state && !state.allowed.some(allowed => isDeepStrictEqual(allowed, current))) throw new Error("The Magpie connection was edited in Tinycast. Restore it or disconnect it manually before retrying.")
  if (!state && current) throw new Error("The reserved Tinycast connection already exists without a recovery record.")
  if (control?.enabled === true) {
    const desired = connectionFor(control)
    const next = state ?? {version: 1, domain: DOMAIN, originalDefault: snapshot.defaultRaw, originalConnectionsPresent: snapshot.connectionsPresent, allowed: [null]}
    const pending = {...next, allowed: next.allowed.some(allowed => isDeepStrictEqual(allowed, desired)) ? next.allowed : [...next.allowed, desired]}
    const connections = current ? snapshot.connections.map(connection => connection.id.toUpperCase() === CONNECTION_ID ? desired : connection) : [...snapshot.connections, desired]
    return {pending, state: {...next, allowed: [desired]}, request: {action: "write", expected: snapshot, connections, defaultRaw: snapshot.defaultRaw, remove: false}}
  }
  if (!state) return null
  const connections = snapshot.connections.filter(connection => connection.id.toUpperCase() !== CONNECTION_ID)
  let selection = null
  if (snapshot.defaultRaw) selection = JSON.parse(Buffer.from(snapshot.defaultRaw, "base64").toString("utf8"))
  const ownedDefault = selection?.api?.connection?.toUpperCase() === CONNECTION_ID
  return {pending: {...state, allowed: state.allowed.includes(null) ? state.allowed : [...state.allowed, null]}, state: null, request: {action: "write", expected: snapshot, connections: connections.length || state.originalConnectionsPresent ? connections : null, defaultRaw: ownedDefault ? state.originalDefault : snapshot.defaultRaw, remove: true}}
}

export function native(request) {
  const executable = path.join(root, "bin", "tinycast-settings")
  try {
    return JSON.parse(execFileSync(executable, [], {input: JSON.stringify(request), encoding: "utf8", timeout: 15000, maxBuffer: 4 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"]}))
  } catch {
    throw new Error("Tinycast's macOS settings helper failed. Run npm run build if the helper is missing or incompatible.")
  }
}

export function sync(paths = pathsFor(), call = native) {
  privateDirectory(path.dirname(paths.control))
  const control = read(paths.control)
  let state = read(paths.state)
  if (!state && control?.enabled !== true) return {status: "disconnected"}
  try {
    fs.writeFileSync(paths.lock, String(process.pid), {flag: "wx", mode: 0o600})
  } catch (error) {
    if (error.code !== "EEXIST") throw error
    const owner = Number(fs.readFileSync(paths.lock, "utf8"))
    if (!Number.isSafeInteger(owner) || owner < 1) throw new Error("Invalid bridge lock; retain it for inspection.")
    try { process.kill(owner, 0); return {status: "busy"} } catch (check) { if (check.code !== "ESRCH") throw check }
    fs.unlinkSync(paths.lock)
    return sync(paths, call)
  }
  try {
    state = read(paths.state)
    const snapshot = call({action: "read"})
    if (snapshot.error) throw new Error(snapshot.error)
    const operation = plan(snapshot, state, control)
    if (!operation) return {status: "disconnected"}
    if (isDeepStrictEqual(snapshot.connections, operation.request.connections ?? []) && snapshot.defaultRaw === operation.request.defaultRaw && snapshot.connectionsPresent === (operation.request.connections !== null)) {
      if (operation.state) {
        write(paths.state, operation.state)
        return {status: snapshot.running ? "connected" : "ready_to_start", models: control.models.length}
      }
      fs.rmSync(paths.state, {force: true})
      return {status: "disconnected"}
    }
    if (snapshot.running) return {status: "waiting_for_tinycast_to_quit", restartRequired: true, models: operation.state ? control.models.length : 0}
    write(paths.state, operation.pending)
    const result = call(operation.request)
    if (result.error) throw new Error(result.error)
    if (result.status !== "applied") return result
    if (operation.state) write(paths.state, operation.state)
    else fs.rmSync(paths.state, {force: true})
    return {status: operation.state ? "ready_to_start" : "disconnected", models: control?.models?.length ?? 0}
  } finally {
    fs.unlinkSync(paths.lock)
  }
}

export function start(paths = pathsFor()) {
  let signature = null
  let retry = true
  let previous = null
  const tick = () => {
    try {
      const current = fs.existsSync(paths.control) ? fs.readFileSync(paths.control, "utf8") : ""
      if (current === signature && !retry) return
      const result = sync(paths)
      signature = current
      retry = ["waiting_for_tinycast_to_quit", "ready_to_start", "busy"].includes(result.status)
      const text = JSON.stringify(result)
      if (text !== previous) { write(paths.status, result); previous = text }
    } catch (error) {
      retry = true
      const result = {status: "error", message: error.message}
      const text = JSON.stringify(result)
      if (text !== previous) { write(paths.status, result); console.error(`[tinycast] ${error.message}`); previous = text }
    }
  }
  tick()
  const timer = setInterval(tick, 3000)
  timer.unref?.()
  return () => { clearInterval(timer); tick() }
}
