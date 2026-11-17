;(async () => {
  let theme = {}, service = "", port = 3497
  try { theme = await window.magpie.ready } catch {}
  try { service = window.magpie.service || "" } catch {}
  try {
    const options = await window.magpie.options.get()
    if (Number.isSafeInteger(Number(options.port)) && Number(options.port) > 0 && Number(options.port) < 65536) port = Number(options.port)
  } catch {}
  const query = new URLSearchParams({theme: theme?.dark ? "dark" : "light", lang: theme?.lang || navigator.language})
  const base = /^https?:\/\//.test(service) ? service.replace(/\/?$/, "/") : `http://127.0.0.1:${port}/`
  location.replace(`${base}?${query}`)
})()
