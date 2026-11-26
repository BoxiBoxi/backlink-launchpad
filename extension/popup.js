const el = document.getElementById('status')
chrome.runtime.sendMessage({ type: 'hello', build: '__BB_BUILD__' }, (r) => {
  if (r && r.ok) {
    el.className = 'ok'
    el.textContent = `Connected to the app (version ${r.data.version}).`
  } else {
    el.className = 'err'
    el.textContent = (r && r.error) || 'Cannot reach the app.'
  }
})
