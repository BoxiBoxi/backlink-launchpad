// Backlink Launchpad panel: shown on pages of sites that have an open task in the app.
// Fills title, body, website URL and image fields when the user clicks Fill. Never clicks submit.
;(() => {
  if (window.top !== window || window.__bbLaunchpad) return
  window.__bbLaunchpad = true

  // Same stamp as background.js (written by the app); a mismatch makes the background reload itself.
  const BUILD = '__BB_BUILD__'
  const send = (msg) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ ...msg, build: BUILD }, (r) => {
          const res = r || { ok: false, error: chrome.runtime.lastError?.message || 'No reply' }
          // An older copy of the extension is still running in this window (it does not know the newer requests).
          if (!res.ok && /unknown message|context invalidated|receiving end does not exist/i.test(res.error || '')) {
            res.error = 'Backlink Launchpad was updated. Close this browser window, then click Open in the app again.'
          }
          resolve(res)
        })
      } catch (err) {
        resolve({ ok: false, error: String(err) })
      }
    })

  // ---------- field detection (same rules as the app's automated fill) ----------
  const TITLE = [
    'textarea[placeholder*="title" i]', 'input[placeholder*="title" i]', 'input[name*="title" i]', 'input[id*="title" i]',
    'textarea[name*="title" i]', 'textarea[id*="title" i]', 'input[placeholder*="tiêu đề" i]', 'textarea[placeholder*="tiêu đề" i]',
    '[contenteditable="true"][data-placeholder*="title" i]', '[contenteditable="true"][aria-label*="title" i]', 'h1[contenteditable="true"]',
    '[data-placeholder*="title" i]', 'h1[data-placeholder]', 'h3.graf--title', 'input[name="name"]', 'input[name*="tool_name" i]', 'input[placeholder*="name" i]'
  ]
  const BODY = [
    'textarea[name*="body" i]', 'textarea[id*="body" i]', 'textarea[name*="content" i]', 'textarea[id*="content" i]',
    'textarea[name*="description" i]', 'textarea[id*="description" i]', 'textarea[placeholder*="write" i]', 'textarea[placeholder*="description" i]',
    'textarea[placeholder*="nội dung" i]', '.ProseMirror[contenteditable="true"]', '.ql-editor[contenteditable="true"]',
    '.public-DraftEditor-content[contenteditable="true"]', '.cm-content[contenteditable="true"]', '[role="textbox"][contenteditable="true"]',
    '[contenteditable="true"]', 'textarea'
  ]
  const WEBSITE = [
    'input[type="url"]', 'input[name*="url" i]:not([name*="image" i]):not([name*="logo" i]):not([name*="video" i])',
    'input[id*="url" i]:not([id*="image" i]):not([id*="logo" i]):not([id*="video" i])', 'input[name*="website" i]', 'input[id*="website" i]',
    'input[placeholder*="https://" i]', 'input[placeholder*="example.com" i]', 'input[placeholder*="website" i]',
    'input[aria-label*="website" i]', 'input[aria-label*="url" i]'
  ]
  const SKIP_TYPES = ['email', 'search', 'password', 'hidden', 'file', 'checkbox', 'radio', 'submit', 'button']

  /** The page and its same-origin iframes (rich-text editors often live in one). */
  function documents() {
    const docs = [document]
    for (const f of document.querySelectorAll('iframe')) {
      try {
        if (f.contentDocument && f.contentDocument.body) docs.push(f.contentDocument)
      } catch {
        /* cross-origin */
      }
    }
    return docs
  }

  const visible = (el) => {
    const r = el.getBoundingClientRect()
    const s = el.ownerDocument.defaultView.getComputedStyle(el)
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'
  }
  const editable = (el) => (el.isContentEditable && !('value' in el)) || (!el.disabled && !el.readOnly && !SKIP_TYPES.includes(el.type))
  const inPanel = (el) => !!el.closest && !!el.closest('#bb-launchpad-host')
  /** Sign-in and sign-up forms (they have a password field) are never filled: "Username" must not get the post title. */
  const inLoginForm = (el) => {
    const form = el.closest && el.closest('form')
    return !!form && !!form.querySelector('input[type="password"]')
  }

  function find(selectors, skip, extra) {
    for (const doc of documents()) {
      for (const sel of selectors) {
        let list
        try {
          list = doc.querySelectorAll(sel)
        } catch {
          continue
        }
        for (const el of list) {
          if (el === skip || inPanel(el) || inLoginForm(el) || !visible(el) || !editable(el)) continue
          if (extra && !extra(el)) continue
          return el
        }
      }
    }
    return null
  }

  /** Set a value the way typing does, so React/Vue forms notice it. */
  function setValue(el, value) {
    const proto = el instanceof el.ownerDocument.defaultView.HTMLTextAreaElement ? 'HTMLTextAreaElement' : 'HTMLInputElement'
    const setter = Object.getOwnPropertyDescriptor(el.ownerDocument.defaultView[proto].prototype, 'value').set
    el.focus()
    setter.call(el, value)
    ourValues.set(el, el.value) // not learned back as typed by the user
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  const looksHtml = (s) => /<(p|h[1-6]|ul|ol|li|a|strong|em|br)\b[^>]*>/i.test(s)

  function setRich(el, value) {
    const doc = el.ownerDocument
    el.focus()
    const sel = doc.getSelection()
    sel.removeAllRanges()
    const range = doc.createRange()
    range.selectNodeContents(el)
    sel.addRange(range)
    const ok = looksHtml(value) ? doc.execCommand('insertHTML', false, value) : doc.execCommand('insertText', false, value)
    if (!ok) {
      el.textContent = looksHtml(value) ? value.replace(/<[^>]+>/g, ' ') : value
      el.dispatchEvent(new InputEvent('input', { bubbles: true }))
    }
  }

  function fillField(el, value) {
    if (el.isContentEditable && !('value' in el)) setRich(el, value)
    else setValue(el, value)
  }

  function b64ToFile(f) {
    const bin = atob(f.base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new File([bytes], f.name, { type: f.type })
  }

  /** Logo to logo/icon inputs, screenshots to the other image inputs (also hidden ones behind custom buttons). */
  async function attachImages(task) {
    if (!task.logo && !task.images) return 0
    const cache = {}
    const get = async (which) => {
      if (!(which in cache)) {
        const r = await send({ type: 'file', taskId: task.taskId, which })
        cache[which] = r.ok && r.data ? b64ToFile(r.data) : null
      }
      return cache[which]
    }
    let attached = 0
    let shot = 0
    for (const doc of documents()) {
      for (const input of [...doc.querySelectorAll('input[type="file"]')].slice(0, 8)) {
        if (input.files && input.files.length) continue
        if (input.accept && !/image|\.png|\.jpe?g|\.webp|\*/i.test(input.accept)) continue
        const label = (input.labels && input.labels[0] && input.labels[0].textContent) || (input.closest('label,div,section') || {}).textContent || ''
        const hint = `${input.name} ${input.id} ${input.getAttribute('aria-label') || ''} ${label.slice(0, 200)}`.toLowerCase()
        const files = []
        if (/logo|icon|avatar|favicon|thumbnail/.test(hint) && task.logo) files.push(await get('logo'))
        else if (task.images) {
          const count = input.multiple ? Math.min(task.images, 5) : 1
          for (let i = 0; i < count; i++) files.push(await get(String((shot++) % task.images)))
        } else if (task.logo) files.push(await get('logo'))
        const ok = files.filter(Boolean)
        if (!ok.length) continue
        const dt = new DataTransfer()
        ok.forEach((f) => dt.items.add(f))
        try {
          input.files = dt.files
          input.dispatchEvent(new Event('input', { bubbles: true }))
          input.dispatchEvent(new Event('change', { bubbles: true }))
          attached++
        } catch {
          /* some inputs refuse programmatic files */
        }
      }
    }
    return attached
  }

  async function fill(task) {
    const done = []
    const missed = []
    let titleEl = null
    if (task.title) {
      titleEl = find(TITLE)
      if (titleEl) {
        fillField(titleEl, task.title)
        done.push('title')
      } else missed.push('title')
    }
    if (task.body) {
      let ok = false
      if (document.querySelector('.CodeMirror')) {
        const r = await send({ type: 'codemirror', text: task.body })
        ok = r.ok && r.data
      }
      if (!ok) {
        const bodyEl = find(BODY, titleEl)
        if (bodyEl) {
          fillField(bodyEl, task.body)
          ok = true
        }
      }
      ;(ok ? done : missed).push('body')
    }
    if (task.website) {
      const w = find(WEBSITE, titleEl, (el) => !el.value)
      if (w) {
        setValue(w, task.website)
        done.push('website URL')
      }
    }
    const files = await attachImages(task)
    if (files) done.push(`${files} image field(s)`)
    return { done, missed }
  }

  // ---------- sign-up and login forms (RoboForm style) ----------
  /** Lowercase, without Vietnamese accents, so "Tên đăng nhập" matches "ten dang nhap". */
  const norm = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/đ/g, 'd')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ')
      .trim()

  /** Everything that describes an input: attributes, its label, or the text just above it. */
  function describe(el) {
    const parts = [el.name, el.id, el.placeholder, el.getAttribute('aria-label'), el.getAttribute('autocomplete')]
    if (el.labels && el.labels.length) parts.push(el.labels[0].textContent)
    else {
      let node = el
      for (let depth = 0; depth < 3 && node && node.parentElement; depth++) {
        let prev = node.previousElementSibling
        while (prev && !prev.textContent.trim()) prev = prev.previousElementSibling
        if (prev && prev.textContent.trim().length < 60 && !prev.querySelector('input,textarea,select')) {
          parts.push(prev.textContent)
          break
        }
        node = node.parentElement
      }
    }
    return norm(parts.filter(Boolean).join(' | '))
  }

  /** What an account-form input is for: email, phone, username, fullName, lastName, firstName, password or null. */
  function classify(el) {
    const type = (el.type || '').toLowerCase()
    if (type === 'password') return 'password'
    if (!['text', 'email', 'tel', ''].includes(type)) return null
    const ac = (el.getAttribute('autocomplete') || '').toLowerCase()
    const d = describe(el)
    if (type === 'email' || ac === 'email' || /e-?mail/.test(d)) return 'email'
    if (type === 'tel' || ac === 'tel' || /phone|mobile|dien thoai|\bsdt\b/.test(d)) return 'phone'
    if (ac === 'username' || /user ?name|login|nickname|handle|ten dang nhap|ten nguoi dung|biet danh|ten tai khoan/.test(d)) return 'username'
    if (ac === 'name' || /full ?name|ho (va )?ten|your name|display name|ten hien thi/.test(d) || el.name === 'name') return 'fullName'
    if (ac === 'family-name' || /last ?name|surname|family|lname|(^|\W)ho( va chu dem| dem)?(\W|$)/.test(d)) return 'lastName'
    if (ac === 'given-name' || /first ?name|given|fname|(^|\W)ten(\W|$)/.test(d)) return 'firstName'
    return null
  }

  /** The visible account form on the page: kind (signup or login) and its classified fields. */
  function accountForm() {
    const pw = [...document.querySelectorAll('input[type="password"]')].filter((el) => !inPanel(el) && visible(el))
    if (!pw.length) return null
    const scope = pw[0].closest('form') || document.body
    const inputs = [...scope.querySelectorAll('input')].filter((el) => !inPanel(el) && visible(el) && !el.disabled && !el.readOnly)
    const fields = inputs.map((el) => ({ el, kind: classify(el) })).filter((f) => f.kind)
    const others = fields.filter((f) => f.kind !== 'password')
    const passwords = fields.filter((f) => f.kind === 'password')
    const kind = passwords.length >= 2 || others.length >= 3 ? 'signup' : 'login'
    return { kind, fields }
  }

  async function fillAccount(form) {
    const mode = form.kind
    const r = await send({ type: 'credentials', url: location.href, mode })
    if (!r.ok) return { done: [], note: r.error }
    const done = []
    const put = (f, value, label) => {
      if (!value || f.el.value) return
      setValue(f.el, value)
      if (!done.includes(label)) done.push(label)
    }
    if (mode === 'login') {
      const { username, email, password } = r.data.login
      for (const f of form.fields) {
        if (f.kind === 'password') put(f, password, 'password')
        else if (f.kind === 'email') put(f, email || username, 'email')
        else put(f, username || email, 'username')
      }
      return { done, note: '' }
    }
    const { profile, password, saved } = r.data
    const vi = (document.documentElement.lang || '').toLowerCase().startsWith('vi')
    const full = (vi ? [profile.lastName, profile.firstName] : [profile.firstName, profile.lastName]).filter(Boolean).join(' ')
    for (const f of form.fields) {
      if (f.kind === 'password') put(f, password, 'password')
      else if (f.kind === 'email') put(f, profile.email, 'email')
      else if (f.kind === 'phone') put(f, profile.phone, 'phone')
      else if (f.kind === 'username') put(f, profile.username, 'username')
      else if (f.kind === 'fullName') put(f, full, 'name')
      else if (f.kind === 'lastName') put(f, profile.lastName, 'last name')
      else if (f.kind === 'firstName') put(f, profile.firstName, 'first name')
    }
    const empty = !profile.email && !profile.username && !profile.firstName
    const note = empty
      ? 'Your sign-up profile is empty: add it in the app, Settings, Sign-up profile.'
      : saved
        ? 'The password is saved in the app (Settings, Saved accounts).'
        : 'This computer has no keychain: copy the password now, the app could not save it.'
    return { done, note, password: saved ? '' : password }
  }

  // ---------- form memory: learn what the user types, fill it on the next sites ----------
  // Field meanings shared by most launch and directory forms. First match wins, so specific ones come first.
  const FIELD_DICT = [
    ['twitter', 'Twitter / X', /twitter|x\.com|\bx (handle|username|profile|account)\b|x \(twitter\)/],
    ['github', 'GitHub', /github/],
    ['linkedin', 'LinkedIn', /linkedin/],
    ['facebook', 'Facebook', /facebook/],
    ['instagram', 'Instagram', /instagram/],
    ['demoVideo', 'Demo video', /youtube|video|loom|vimeo|demo (url|link)/],
    ['appStore', 'App Store link', /app ?store|ios app|apple store/],
    ['playStore', 'Google Play link', /play ?store|google play|android app/],
    ['chromeStore', 'Chrome Web Store link', /chrome (web )?store|extension (url|link)/],
    ['productHunt', 'Product Hunt link', /product ?hunt/],
    ['launchDate', 'Launch date', /launch(ed)? (date|day)|release date|ngay (ra mat|phat hanh)/],
    ['promo', 'Promo / discount', /promo|coupon|discount|deal|offer code|ma giam gia|uu dai/],
    ['pricing', 'Pricing', /pricing|price|business model|plan type|free or paid|monetization|bang gia|(^|\W)gia( ban)?(\W|$)/],
    ['category', 'Category', /categor|industry|niche|vertical|danh muc|linh vuc|the loai/],
    ['tags', 'Tags', /(^|\W)tags?(\W|$)|keywords|topics|hashtags|tu khoa/],
    ['tagline', 'Tagline', /tagline|one.?liner|slogan|short pitch|headline|subtitle|catch ?phrase|elevator pitch|khau hieu/],
    ['shortDescription', 'Short description', /short desc|summary|brief desc|excerpt|in one sentence|mo ta ngan|tom tat/],
    ['longDescription', 'Description', /description|describe|about (the |your )?(product|startup|project|tool|app|company)|details|tell us|what does|mo ta|gioi thieu/],
    ['productName', 'Product name', /(product|tool|app|startup|project|company|brand|software) name|name of (your|the)|ten (san pham|du an|cong ty|thuong hieu|cong cu|ung dung)/],
    ['founderName', 'Your name', /maker|founder|your name|full name|contact name|ho (va )?ten|nguoi sang lap/],
    ['country', 'Country', /country|based in|quoc gia/],
    ['teamSize', 'Team size', /team size|employees|company size|so nhan vien/],
    ['foundedYear', 'Founded', /founded|year (started|established)|nam thanh lap/],
    ['website', 'Website', /website|homepage|home page|product (url|link)|site (url|link)|landing|(^|\W)url(\W|$)|link to (your|the)|trang web|duong dan/]
  ]
  const MEDIA = /logo|image|icon|avatar|screenshot|thumbnail|banner|cover/
  const SECRET_FIELD = /pass|pwd|card|cvc|cvv|iban|otp|one-time|captcha|secret|token|api ?key|private key|security code|verification code|ma xac (nhan|thuc)|mat khau/

  /** The single most human label of a field (used to name fields that are not in the dictionary). */
  function primaryLabel(el) {
    if (el.labels && el.labels.length && el.labels[0].textContent.trim()) return el.labels[0].textContent
    const aria = el.getAttribute('aria-label')
    if (aria) return aria
    let node = el
    for (let depth = 0; depth < 3 && node && node.parentElement; depth++) {
      let prev = node.previousElementSibling
      while (prev && !prev.textContent.trim()) prev = prev.previousElementSibling
      if (prev && prev.textContent.trim().length < 80 && !prev.querySelector('input,textarea,select')) return prev.textContent
      node = node.parentElement
    }
    return el.placeholder || el.name || el.id || ''
  }
  const cleanLabel = (s) => String(s || '').replace(/[*:]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)

  /** A field the memory may read or fill: plain text, url, number, textarea or select, never secrets. */
  function memoryField(el) {
    if (inPanel(el) || el.disabled || el.readOnly) return false
    const tag = el.tagName
    if (tag === 'SELECT' || tag === 'TEXTAREA') return !SECRET_FIELD.test(describe(el))
    if (tag !== 'INPUT') return false
    const type = (el.type || 'text').toLowerCase()
    if (!['text', 'url', 'email', 'tel', 'number', 'date', 'search'].includes(type) || type === 'search') return false
    const ac = (el.getAttribute('autocomplete') || '').toLowerCase()
    if (ac.startsWith('cc-') || ac === 'one-time-code' || ac.includes('password')) return false
    return !SECRET_FIELD.test(describe(el))
  }

  /** What a field means: a dictionary key, or label:<its label> for anything else. */
  function fieldKey(el) {
    const d = describe(el)
    const label = cleanLabel(primaryLabel(el))
    const media = MEDIA.test(d)
    if (!media || /youtube|video/.test(d)) {
      for (const [key, name, re] of FIELD_DICT) {
        if (!re.test(d)) continue
        if (key === 'website' && media) break
        // A one-line "description" field with a small limit is the short description.
        if (key === 'longDescription' && el.tagName === 'INPUT' && (el.maxLength > 0 ? el.maxLength <= 160 : true)) return { key: 'shortDescription', name: 'Short description', label }
        return { key, name, label }
      }
      if ((el.type || '').toLowerCase() === 'url' && !media) return { key: 'website', name: 'Website', label }
      if (norm(el.name) === 'name' || norm(label) === 'name') return { key: 'productName', name: 'Product name', label }
    }
    const n = norm(label)
    return n ? { key: `label:${n.slice(0, 60)}`, name: label, label } : null
  }

  const STOP = new Set(['your', 'the', 'of', 'a', 'an', 'and', 'or', 'to', 'for', 'is', 'cua', 'ban', 'va'])
  const tokens = (s) => new Set(norm(s).split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t)))
  function similarity(a, b) {
    const x = tokens(a)
    const y = tokens(b)
    if (!x.size || !y.size) return 0
    let inter = 0
    x.forEach((t) => y.has(t) && inter++)
    return inter / (x.size + y.size - inter)
  }

  const isEmpty = (el) => (el.tagName === 'SELECT' ? el.selectedIndex <= 0 || !el.value : !el.value)

  function setSelect(el, value) {
    const want = norm(value)
    const opts = [...el.options].filter((o) => o.value)
    const opt =
      opts.find((o) => norm(o.textContent) === want || norm(o.value) === want) ||
      opts.find((o) => want && (norm(o.textContent).includes(want) || want.includes(norm(o.textContent))))
    if (!opt) return false
    el.value = opt.value
    ourValues.set(el, el.value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }

  function fitTo(el, value) {
    const max = el.maxLength > 0 ? el.maxLength : 0
    if (!max || value.length <= max) return value
    const cut = value.slice(0, max)
    const space = cut.lastIndexOf(' ')
    return space > max * 0.6 ? cut.slice(0, space) : cut
  }

  /** Candidate fields on the page for the memory, outside sign-in/sign-up forms. */
  function memoryFields() {
    const out = []
    for (const doc of documents()) {
      for (const el of doc.querySelectorAll('input, textarea, select')) {
        if (!memoryField(el) || inLoginForm(el) || !visible(el)) continue
        const k = fieldKey(el)
        if (k) out.push({ el, ...k })
      }
    }
    return out
  }

  // ---------- site form recipes: which field on this site means what (shared JSON, no personal values) ----------
  /** Ids generated by frameworks (":r3:", "input-1742...") change on every load: never use them. */
  const stableId = (id) => !!id && !/[:\s]|\d{4,}|^[0-9]/.test(id) && id.length < 60
  const cssEsc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'))

  /** A selector that finds the same field next time: id, name, or a short path from a stable ancestor. */
  function cssPath(el) {
    const tag = el.tagName.toLowerCase()
    if (stableId(el.id)) return `#${cssEsc(el.id)}`
    if (el.name && !/\d{4,}/.test(el.name)) {
      const sel = `${tag}[name="${cssEsc(el.name)}"]`
      if (el.ownerDocument.querySelectorAll(sel).length === 1) return sel
    }
    const parts = []
    let node = el
    for (let depth = 0; node && node.nodeType === 1 && depth < 6; depth++) {
      if (depth > 0 && stableId(node.id)) {
        parts.unshift(`#${cssEsc(node.id)}`)
        break
      }
      const t = node.tagName.toLowerCase()
      if (t === 'body' || t === 'html') break
      const same = node.parentElement ? [...node.parentElement.children].filter((c) => c.tagName === node.tagName) : []
      parts.unshift(same.length > 1 ? `${t}:nth-of-type(${same.indexOf(node) + 1})` : t)
      node = node.parentElement
    }
    return parts.join(' > ')
  }

  /** The recipe's meaning for a field, if this site has one. */
  function recipeKey(el) {
    const fields = recipe && recipe.fields
    if (!fields) return null
    const hit = fields[cssPath(el)]
    return hit ? { key: hit.key, name: hit.name || hit.key, label: hit.label || '' } : null
  }

  /**
   * Fill empty fields from memory. The site's recipe decides first; then known meanings and identical labels.
   * Fields whose label only resembles a remembered one come back as suggestions for the user to accept.
   */
  function memoryFill(memory) {
    const filled = []
    const suggestions = []
    if (!memory) return { filled, suggestions }
    const values = memory.values || {}
    const learnedLabels = Object.entries(values).filter(([k]) => k.startsWith('label:'))
    for (const f of memoryFields()) {
      if (!isEmpty(f.el)) continue
      const known = recipeKey(f.el) || f
      const hit = values[known.key]
      if (hit && hit.value) {
        const ok = f.el.tagName === 'SELECT' ? setSelect(f.el, hit.value) : (setValue(f.el, fitTo(f.el, hit.value)), true)
        if (ok) {
          filled.push(known.name)
          continue
        }
      }
      if (!known.key.startsWith('label:')) continue
      let best = null
      for (const [k, v] of learnedLabels) {
        const score = similarity(f.label, v.label || k.slice(6))
        if (score >= 0.5 && (!best || score > best.score)) best = { score, value: v.value, from: v.label || k.slice(6) }
      }
      if (best) suggestions.push({ el: f.el, name: f.name, value: best.value, from: best.from })
    }
    return { filled, suggestions }
  }

  // Values the extension itself put in, so they are not "learned" back as if the user had typed them.
  const ourValues = new WeakMap()
  let pendingLearn = new Map()
  let learnTimer = null
  let memoryState = null
  let recipe = null

  /** The post itself (title, body) is written per site: never remember it as a reusable value. */
  function isPostText(value) {
    if (!current) return false
    const v = norm(value)
    return v.length > 20 && [current.title, current.body].some((t) => t && (norm(t) === v || norm(t).includes(v.slice(0, 200))))
  }

  function onUserChange(e) {
    const el = e.target
    if (!memoryState || !memoryState.learn || !el || !el.tagName || !memoryField(el) || inLoginForm(el)) return
    const value = el.tagName === 'SELECT' ? (el.selectedOptions[0] ? el.selectedOptions[0].textContent.trim() : '') : String(el.value || '').trim()
    if (!value || ourValues.get(el) === el.value || value.length > 3000 || isPostText(value)) return
    const k = recipeKey(el) || fieldKey(el)
    if (!k) return
    pendingLearn.set(k.key, { key: k.key, name: k.name, label: k.label, value, selector: cssPath(el) })
    clearTimeout(learnTimer)
    learnTimer = setTimeout(flushLearn, 800)
  }

  async function flushLearn() {
    if (!pendingLearn.size || !memoryState) return
    const items = [...pendingLearn.values()]
    pendingLearn = new Map()
    const r = await send({ type: 'learn', url: location.href, projectId: memoryState.projectId, items })
    if (r.ok && r.data) {
      items.forEach((it) => {
        memoryState.values[it.key] = { value: it.value, label: it.label, learned: true }
        if (recipe) recipe.fields[it.selector] = { key: it.key, name: it.name, label: it.label }
      })
      if (r.data.changed && host) render(false)
    }
  }

  // ---------- panel ----------
  let tasks = []
  let current = null
  let site = null
  let form = null
  let host = null
  let ui = null
  let suggestions = []
  let lastStatus = { text: '', err: false }

  const CSS = `
    :host { all: initial; }
    .box { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: 310px; max-height: 80vh; overflow: auto; background: #fff; color: #111827;
      border: 1px solid #e5e7eb; border-radius: 14px; box-shadow: 0 12px 32px rgba(17,24,39,.18); font: 13px/1.4 system-ui, -apple-system, Segoe UI, sans-serif; }
    .head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #f3f4f6; }
    .head img { width: 20px; height: 20px; }
    .head b { flex: 1; font-size: 13px; }
    .x { border: 0; background: none; color: #9ca3af; font-size: 18px; cursor: pointer; line-height: 1; padding: 0 2px; }
    .x:hover { color: #111827; }
    .body { padding: 10px 12px 12px; display: grid; gap: 8px; }
    .info { font-size: 13px; line-height: 1.35; word-break: break-word; }
    .info .muted { font-size: 13px; }
    .muted { color: #6b7280; font-size: 12px; }
    select { width: 100%; padding: 5px; border: 1px solid #d1d5db; border-radius: 8px; font: inherit; }
    button.b { width: 100%; border: 1px solid #d1d5db; background: #fff; border-radius: 8px; padding: 8px; font: inherit; cursor: pointer; color: #111827; }
    button.b:hover { background: #f9fafb; }
    button.primary { background: #111827; color: #fff; border-color: #111827; font-weight: 600; }
    button.primary:hover { background: #1f2937; }
    button.posted { background: #ecfdf5; border-color: #a7f3d0; color: #065f46; }
    .status { font-size: 12px; color: #374151; white-space: pre-wrap; }
    .status:empty { display: none; }
    .status.err { color: #b91c1c; }
    .sugg { border: 1px solid #fde68a; background: #fffbeb; border-radius: 10px; padding: 8px; display: grid; gap: 6px; }
    .sugg-row { display: flex; gap: 6px; align-items: center; }
    .sugg-row div { flex: 1; min-width: 0; font-size: 12px; }
    .sugg-row .v { color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sugg-row button { border: 1px solid #d1d5db; background: #fff; border-radius: 6px; padding: 3px 8px; font: inherit; font-size: 12px; cursor: pointer; }
    .mini { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: 44px; height: 44px; border-radius: 22px; border: 1px solid #e5e7eb;
      background: #fff; box-shadow: 0 8px 24px rgba(17,24,39,.2); cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .mini img { width: 24px; height: 24px; }
  `

  const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

  function render(minimized) {
    if (!host) {
      host = document.createElement('div')
      host.id = 'bb-launchpad-host'
      document.documentElement.appendChild(host)
      ui = host.attachShadow({ mode: 'closed' })
    }
    const icon = chrome.runtime.getURL('icon-48.png')
    if (minimized) {
      ui.innerHTML = `<style>${CSS}</style><button class="mini" title="Backlink Launchpad"><img src="${icon}" alt=""></button>`
      ui.querySelector('.mini').onclick = () => render(false)
      return
    }
    let info = ''
    const line = (label, value) => `<div class="info"><span class="muted">${label}:</span> ${esc(value)}</div>`
    if (tasks.length > 1) {
      info = `<select>${tasks.map((t, i) => `<option value="${i}">${esc(t.siteName)} · ${esc(t.projectName)}</option>`).join('')}</select>`
      if (current.hasContent && current.title) info += line('Subject', current.title)
    } else if (current) {
      info = line('Website', current.siteName) + (current.hasContent && current.title ? line('Subject', current.title) : '')
    } else if (site) {
      info = line('Website', site.name)
    }
    const suggPart = suggestions.length
      ? `<div class="sugg"><div class="muted">Similar to what you typed before:</div>${suggestions
          .map((s, i) => `<div class="sugg-row"><div><b>${esc(s.name)}</b><div class="v" title="${esc(s.value)}">${esc(s.value)}</div></div><button data-s="${i}">Use</button></div>`)
          .join('')}</div>`
      : ''
    ui.innerHTML = `<style>${CSS}</style>
      <div class="box">
        <div class="head"><img src="${icon}" alt=""><b>Backlink Launchpad</b><button class="x" data-a="min" title="Minimize">–</button></div>
        <div class="body">
          ${info}
          <button class="b primary" data-a="fill">Fill the form</button>
          ${current ? `<button class="b posted" data-a="posted">Save the posted URL</button>` : ''}
          ${suggPart}
          <div class="status"></div>
        </div>
      </div>`
    const sel = ui.querySelector('select')
    if (sel) {
      sel.value = String(tasks.indexOf(current))
      sel.onchange = () => {
        current = tasks[Number(sel.value)]
        render(false)
      }
    }
    ui.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => action(b.dataset.a)))
    ui.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => useSuggestion(Number(b.dataset.s))))
    status(lastStatus.text, lastStatus.err)
  }

  function useSuggestion(i) {
    const s = suggestions[i]
    if (!s) return
    if (s.el.tagName === 'SELECT') setSelect(s.el, s.value)
    else setValue(s.el, fitTo(s.el, s.value))
    suggestions = suggestions.filter((x) => x !== s)
    render(false)
  }

  function status(text, err) {
    lastStatus = { text, err: !!err }
    const el = ui && ui.querySelector('.status')
    if (!el) return
    el.textContent = text
    el.className = `status${err ? ' err' : ''}`
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }

  /**
   * Fill the form: whatever is on the page. Sign-up / sign-in details, the post (title, body, website, images)
   * when the page has a task, then everything the form memory knows. Only empty fields; never submits.
   */
  async function runFill() {
    status('Filling...')
    const done = []
    const notes = []
    let missed = []
    const account = site ? accountForm() : null
    if (account) {
      form = account
      const r = await fillAccount(account)
      done.push(...r.done)
      if (r.note) notes.push(r.note)
      if (r.password && (await copyText(r.password))) notes.push('Password copied to the clipboard.')
    }
    if (current) {
      const r = await fill(current)
      done.push(...r.done)
      // A sign-in page has no post fields: do not report them as missing there.
      if (!account) missed = r.missed
    }
    const m = memoryFill(memoryState)
    suggestions = m.suggestions
    done.push(...m.filled.map((n) => n.toLowerCase()))
    const parts = []
    if (done.length) parts.push(`Filled: ${[...new Set(done)].join(', ')}.`)
    if (missed.length) parts.push(`Not found: ${missed.join(', ')}. The ${missed.join(' and ')} ${missed.length > 1 ? 'are' : 'is'} on your clipboard from the app: paste it.`)
    if (suggestions.length) parts.push(`${suggestions.length} suggestion(s) below.`)
    parts.push(...notes)
    lastStatus = { text: parts.join('\n') || 'No empty fields to fill on this page.', err: !done.length && !suggestions.length }
    render(false)
  }

  async function action(a) {
    if (a === 'min') return render(true)
    if (a === 'fill') return runFill()
    if (a === 'posted') {
      const url = location.href
      if (!confirm(`Save this page as the live post for ${current.siteName}?\n\n${url}`)) return
      const r = await send({ type: 'posted', taskId: current.taskId, url })
      if (!r.ok) return status(r.error, true)
      status('Saved. The link is now tracked in the Link monitor.')
      setTimeout(() => {
        tasks = tasks.filter((t) => t !== current)
        current = tasks[0] || null
        if (!current && !site) {
          host.remove()
          host = null
        } else render(false)
      }, 1500)
    }
  }

  /** The page has a real submit form for the memory: at least two fields it knows. */
  const knownFields = () =>
    memoryFields().filter((f) => {
      const k = recipeKey(f.el) || f
      return !k.key.startsWith('label:') && memoryState && memoryState.values[k.key]
    }).length

  /** Wait for single-page apps to draw their form, then run fn once (gives up after 20 s). */
  function whenReady(test, fn) {
    if (test()) return fn()
    const started = Date.now()
    const timer = setInterval(() => {
      if (test()) {
        clearInterval(timer)
        fn()
      } else if (Date.now() - started > 20000) clearInterval(timer)
    }, 700)
  }

  async function check() {
    const r = await send({ type: 'match', url: location.href })
    if (!r.ok || !r.data) return
    const data = r.data
    tasks = data.tasks || []
    current = tasks[0] || null
    site = data.site
    memoryState = data.memory || null
    recipe = data.recipe || (site ? { fields: {} } : null)
    if (memoryState) document.addEventListener('change', onUserChange, true)
    window.addEventListener('pagehide', () => void flushLearn())
    form = site ? accountForm() : null
    // Only a catalog page with nothing to do yet: a small button, not the whole panel.
    if (current || form) render(false)
    else if (site) render(true)
    if (!data.autofill && !(current && current.autoFill)) return
    if (form) {
      // Sign-in pages are filled only when an account is saved for the site.
      if (form.kind === 'signup' || data.hasAccount) void runFill()
      return
    }
    if (current && current.autoFill) {
      // Opened from the app with Open: fill as soon as the editor is on the page.
      whenReady(() => !!find(BODY) || !!find(TITLE) || knownFields() >= 2, () => void runFill())
      return
    }
    if (site) {
      whenReady(
        () => !!accountForm() || knownFields() >= 2,
        () => {
          const f = accountForm()
          if (f && f.kind !== 'signup' && !data.hasAccount) {
            form = f
            return render(false)
          }
          void runFill()
        }
      )
    }
  }

  void check()
})()
