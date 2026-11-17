import assert from "node:assert/strict"
import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import {test} from "node:test"
import {publicStatus, renderStatus, serve} from "../service.mjs"

test("status page shows restart guidance without leaking private status fields", () => {
  const html = renderStatus({status: "waiting_for_tinycast_to_quit", models: 10, message: "private-message"}, {dark: true, chinese: true})
  assert.match(html, /請完整退出並重啟 Tinycast/)
  assert.match(html, /card warning/)
  assert.match(html, /10 個模型/)
  assert.doesNotMatch(html, /private-message/)
})

test("local status service refreshes from disk and refuses writes and foreign hosts", async context => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tinycast-status-test-"))
  const paths = {status: path.join(directory, "status.json")}
  const server = await serve({paths, port: 0})
  context.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(directory, {recursive: true, force: true}) })
  const base = `http://127.0.0.1:${server.address().port}`
  assert.equal(publicStatus(paths).status, "disconnected")
  fs.writeFileSync(paths.status, JSON.stringify({status: "waiting_for_tinycast_to_quit", message: "private-value", models: 2}))
  const response = await fetch(base)
  assert.match(await response.text(), /Restart Tinycast to apply changes/)
  assert.match(response.headers.get("content-security-policy"), /default-src 'none'/)
  fs.writeFileSync(paths.status, JSON.stringify({status: "connected", models: 3}))
  const html = await (await fetch(base)).text()
  assert.match(html, /Connected to Magpie/)
  assert.doesNotMatch(html, /private-value/)
  assert.equal((await fetch(base, {method: "POST"})).status, 405)
  const foreignHostStatus = await new Promise((resolve, reject) => {
    const request = http.get(base, {headers: {Host: "example.com"}}, response => { response.resume(); resolve(response.statusCode) })
    request.on("error", reject)
  })
  assert.equal(foreignHostStatus, 403)
  assert.equal((await fetch(`${base}/unknown`)).status, 404)
})
