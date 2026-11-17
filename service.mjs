import fs from "node:fs"
import http from "node:http"
import {pathsFor} from "./bridge.mjs"

const states = {
  disconnected: ["neutral", "Not connected", "Turn on Tinycast in Magpie’s Agents page to synchronize models.", "尚未連接", "在 Magpie 的 Agents 頁面啟用 Tinycast，即可同步模型。"],
  waiting_for_tinycast_to_quit: ["warning", "Restart Tinycast to apply changes", "Quit Tinycast from its menu-bar icon, wait a few seconds, then reopen it. ⌘Q only closes its window.", "請完整退出並重啟 Tinycast", "從選單列圖示退出 Tinycast，稍等幾秒後重新開啟。⌘Q 只會關閉視窗。"],
  ready_to_start: ["ready", "Ready — open Tinycast", "Settings are saved. Open Tinycast and choose a model under Magpie.", "設定完成，請開啟 Tinycast", "設定已儲存。在 Tinycast 的模型選單選擇 Magpie 下的模型。"],
  connected: ["ready", "Connected to Magpie", "Choose a Magpie model in Tinycast. No API key or Keychain password is needed.", "已連接 Magpie", "在 Tinycast 選擇 Magpie 下的模型即可，無需 API 金鑰或鑰匙圈密碼。"],
  busy: ["neutral", "Synchronizing…", "Another Magpie process is applying settings. This panel refreshes automatically.", "正在同步…", "另一個 Magpie 程序正在更新設定，此面板會自動重新整理。"],
  error: ["warning", "Connection needs attention", "Run the plugin’s check command for details. Recovery data is retained; no credentials are displayed here.", "連接需要處理", "執行外掛的 check 指令查看詳情。復原資料仍保留，此處不會顯示憑證。"]
}

export function publicStatus(paths) {
  try {
    const value = JSON.parse(fs.readFileSync(paths.status, "utf8"))
    const status = Object.hasOwn(states, value.status) ? value.status : "error"
    return {status, models: Number.isSafeInteger(value.models) && value.models >= 0 ? value.models : 0}
  } catch (error) {
    return {status: error.code === "ENOENT" ? "disconnected" : "error", models: 0}
  }
}

export function renderStatus(value, {dark = false, chinese = false} = {}) {
  const [tone, title, detail, chineseTitle, chineseDetail] = states[value.status] ?? states.error
  const models = Number.isSafeInteger(value.models) && value.models >= 0 ? value.models : 0
  return `<!doctype html><html lang="${chinese ? "zh-Hant" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="3"><title>Tinycast · Magpie</title><style>
  :root{color-scheme:${dark ? "dark" : "light"};font:13px/1.5 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;color:${dark ? "#e6e4ec" : "#292433"};background:${dark ? "#202124" : "#fff"}}
  *{box-sizing:border-box}body{margin:0;padding:12px 16px}.card{display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border:1px solid ${dark ? "#47414f" : "#e4deef"};border-radius:12px}.icon{color:#a276ff;flex:none;width:28px;height:32px}h1{font-size:14px;margin:0 0 4px}.detail{margin:0;max-width:780px}.warning h1{color:${dark ? "#ffd166" : "#8a5900"}}.warning{border-color:${dark ? "#786032" : "#d9b965"};background:${dark ? "#302b20" : "#fff9e8"}}.ready h1{color:${dark ? "#a9d3a4" : "#356b35"}}footer{display:flex;gap:12px;margin-top:7px;font-size:11px;opacity:.7}a{color:inherit}
  </style></head><body><section class="card ${tone}" role="status"><svg class="icon" viewBox="0 0 24 24" aria-label="Tinycast"><path fill="currentColor" d="M18.82 9.18A2 2 0 0 0 17 8h-1.81l1.33-3.26a2 2 0 0 0-.19-1.84 2.06 2.06 0 0 0-1.71-.9h-4.34a2 2 0 0 0-1.91 1.27l-3.23 8a2 2 0 0 0 .2 1.83 2.06 2.06 0 0 0 1.71.9h2.76L8 20.74a1 1 0 0 0 .5 1.15A1.1 1.1 0 0 0 9 22a1 1 0 0 0 .76-.35l8.8-10.37a2 2 0 0 0 .26-2.1"/></svg><div><h1>Tinycast · ${chinese ? chineseTitle : title}</h1><p class="detail">${chinese ? chineseDetail : detail}</p><footer><span>${models} ${chinese ? "個模型" : "models"}</span><a href="https://github.com/BaksiLi/magpie-agent-tinycast" target="_blank" rel="noreferrer">${chinese ? "原始碼與說明" : "Source & help"}</a></footer></div></section></body></html>`
}

export async function serve({paths = pathsFor(), port = 3497} = {}) {
  const selectedPort = Number(port)
  if (!Number.isSafeInteger(selectedPort) || selectedPort < 0 || selectedPort > 65535) throw new Error("Invalid Tinycast status port.")
  const server = http.createServer((request, response) => {
    const host = request.headers.host || ""
    if (!/^127\.0\.0\.1:\d+$/.test(host)) { response.writeHead(403).end(); return }
    const url = new URL(request.url, `http://${host}`)
    response.setHeader("Cache-Control", "no-store")
    response.setHeader("X-Content-Type-Options", "nosniff")
    response.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'")
    if (request.method !== "GET") { response.writeHead(405, {Allow: "GET"}).end(); return }
    if (url.pathname === "/health") { response.writeHead(200, {"Content-Type": "text/plain"}).end("magpie-agent-tinycast"); return }
    if (url.pathname !== "/") { response.writeHead(404).end(); return }
    response.writeHead(200, {"Content-Type": "text/html; charset=utf-8"})
    response.end(renderStatus(publicStatus(paths), {dark: url.searchParams.get("theme") === "dark", chinese: /^zh/i.test(url.searchParams.get("lang") || "")}))
  })
  return new Promise((resolve, reject) => {
    server.once("error", error => {
      if (error.code === "EADDRINUSE") { console.error("[tinycast] Status port is already in use; the settings bridge remains active."); resolve(null) }
      else reject(error)
    })
    server.listen(selectedPort, "127.0.0.1", () => { server.unref(); resolve(server) })
  })
}
