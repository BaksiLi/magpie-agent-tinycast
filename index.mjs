import {pathsFor, start, sync} from "./bridge.mjs"
import {serve} from "./service.mjs"

const instance = Symbol.for("magpie.tinycast.bridge.v1")

export default async function TinycastAgent(input, options = {}) {
  if (process.platform === "darwin" && !globalThis[instance]) {
    const paths = pathsFor()
    globalThis[instance] = {stop: start(paths), server: await serve({paths, port: options.port})}
    process.once("exit", () => {
      try { sync(paths) } catch { console.error("[tinycast] Pending changes retained; quit Tinycast and run the doctor's --sync command.") }
    })
  }
  return {}
}
