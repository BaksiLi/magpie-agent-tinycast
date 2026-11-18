import {native, pathsFor, sync} from "../bridge.mjs"

if (process.platform !== "darwin") {
  console.error("Tinycast's settings bridge requires macOS.")
  process.exitCode = 1
} else {
  const paths = pathsFor()
  if (process.argv.includes("--sync")) {
    try {
      const result = sync(paths)
      console.log(JSON.stringify(result, null, 2))
      if (result.status === "waiting_for_tinycast_to_quit") {
        console.error("Quit Tinycast from its menu-bar icon and run the sync again.")
        process.exitCode = 1
      } else if (result.status === "busy") {
        console.error("Another sync is running. Try again after it finishes.")
        process.exitCode = 1
      }
    } catch (error) {
      console.error(error.message)
      process.exitCode = 1
    }
  } else {
    const snapshot = native({action: "read"})
    if (snapshot.error) process.exitCode = 1
    console.log(JSON.stringify({platform: process.platform, tinycastRunning: snapshot.running, helperError: snapshot.error, connections: snapshot.connections?.map(connection => ({name: connection.name, models: connection.models?.length}))}, null, 2))
  }
}
