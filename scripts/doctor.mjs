import fs from "node:fs"
import {native, pathsFor, sync} from "../bridge.mjs"

if (process.platform !== "darwin") {
  console.error("Tinycast's settings bridge requires macOS.")
  process.exitCode = 1
} else {
  const paths = pathsFor()
  if (process.argv.includes("--sync")) {
    const result = sync(paths)
    console.log(JSON.stringify(result, null, 2))
  } else {
    const snapshot = native({action: "read"})
    console.log(JSON.stringify({platform: process.platform, tinycastRunning: snapshot.running, helperError: snapshot.error, configured: fs.existsSync(paths.control), recoveryRecorded: fs.existsSync(paths.state), statusFile: paths.status, connections: snapshot.connections?.map(connection => ({name: connection.name, models: connection.models?.length}))}, null, 2))
  }
}
