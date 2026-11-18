export const agent = {
  id: "tinycast",
  name: "Tinycast",
  icon: "https://raw.githubusercontent.com/BaksiLi/magpie-agent-tinycast/main/brand/icon.svg",
  dir: "~/Library/Application Support/com.abueammar.tinycast",
  config: "~/.config/magpie-tinycast/connection.json",
  format: "json",
  ua: ["Tinycast"],
  notice: "Quit Tinycast from its menu-bar icon, run npm run sync in magpie-agent-tinycast, then reopen Tinycast. ／ 請從選單列完整退出 Tinycast，在 magpie-agent-tinycast 套件目錄執行 npm run sync，再開啟 Tinycast。"
}

export function connect({gateway, models}) {
  if (!/^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?\/v1\/?$/i.test(gateway?.v1 || "")) {
    throw new Error("This Tinycast integration requires a localhost Magpie gateway. Create remote authenticated connections in Tinycast itself.")
  }
  const seen = new Set()
  const catalog = []
  for (const model of models || []) {
    if (!model || typeof model.id !== "string" || !model.id || seen.has(model.id)) continue
    seen.add(model.id)
    const entry = {id: model.id, images: model.images === true}
    if (Number.isSafeInteger(model.output) && model.output > 0) entry.output = model.output
    const efforts = (model.efforts || []).filter(effort => ["minimal", "low", "medium", "high", "xhigh", "max"].includes(effort))
    if (efforts.length) entry.efforts = efforts
    catalog.push(entry)
  }
  return {enabled: true, baseURL: gateway.v1.replace(/\/v1\/?$/i, "/agent/tinycast/v1"), models: catalog}
}
