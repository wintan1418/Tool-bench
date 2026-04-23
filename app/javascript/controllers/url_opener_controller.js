import { Controller } from "@hotwired/stimulus"

// Paste, parse, and open or save a set of URLs.
export default class extends Controller {
  static targets = ["textarea", "list", "stats", "openBtn", "saveBtn", "nameInput", "nameHint", "countChip", "seed"]
  static values  = { saved: Boolean }

  connect () {
    this.delay = 0
    this.urls  = []

    if (this.savedValue && this.hasSeedTarget) {
      try {
        this.urls = JSON.parse(this.seedTarget.textContent)
      } catch (_) {}
    } else if (this.hasTextareaTarget) {
      this.parse()
    }

    if (this.hasNameInputTarget && this.hasNameHintTarget) {
      this.nameInputTarget.addEventListener("input", () => {
        const v = this.slugify(this.nameInputTarget.value) || "mon-am"
        this.nameHintTarget.textContent = v
      })
    }
  }

  parse () {
    if (!this.hasTextareaTarget) return
    this.urls = this.parseText(this.textareaTarget.value)
    this.render()
  }

  parseText (raw) {
    const lines = raw.split(/\r?\n/)
    const out = []
    for (let line of lines) {
      line = line.trim()
      if (!line || line.startsWith("#")) continue
      const md = line.match(/\[[^\]]*\]\(([^)]+)\)/)
      if (md) { out.push(md[1]); continue }
      line = line.replace(/^[\-\*•]\s+/, "")
      for (const token of line.split(/[\s,]+/)) {
        if (token) out.push(token)
      }
    }
    const cleaned = []
    const seen = new Set()
    for (let u of out) {
      u = this.normaliseUrl(u)
      if (!u) continue
      if (seen.has(u)) continue
      seen.add(u)
      cleaned.push(u)
      if (cleaned.length >= 50) break
    }
    return cleaned
  }

  normaliseUrl (u) {
    const s = u.trim()
    if (!s) return null
    if (/^(javascript|data|vbscript|file):/i.test(s)) return null
    const full = /^https?:\/\//i.test(s) ? s : `https://${s}`
    try { new URL(full) } catch (_) { return null }
    return full
  }

  render () {
    const list = this.listTarget
    if (this.urls.length === 0) {
      list.innerHTML = `<div class="tb-mono tb-muted" style="padding: 20px 22px; font-size: 12px;">Your parsed links will appear here.</div>`
    } else {
      list.innerHTML = this.urls.map((u, i) => `
        <div class="tb-file-row" style="grid-template-columns: 40px 1fr 24px; gap: 12px; padding: 10px 22px;">
          <span class="tb-mono" style="font-size: 11px; color: var(--tb-faint); text-align: right;">${String(i + 1).padStart(2, "0")}</span>
          <div class="tb-mono tb-file-name" style="font-size: 12px;">${this.escape(u)}</div>
          <span class="tb-muted" style="font-size: 14px;">↗</span>
        </div>`).join("")
    }
    if (this.hasStatsTarget) this.statsTarget.textContent = `${this.urls.length} url${this.urls.length === 1 ? "" : "s"} detected · duplicates removed · order preserved`
    if (this.hasCountChipTarget) this.countChipTarget.textContent = this.urls.length
    if (this.hasOpenBtnTarget) this.openBtnTarget.disabled = this.urls.length === 0
    if (this.hasSaveBtnTarget) this.saveBtnTarget.disabled = this.urls.length === 0
  }

  setDelay (e) {
    this.delay = parseInt(e.currentTarget.dataset.delay, 10) || 0
    const parent = e.currentTarget.parentElement
    parent.querySelectorAll(".tb-tab").forEach((b) => b.classList.remove("is-active"))
    e.currentTarget.classList.add("is-active")
  }

  async openAll () {
    let blocked = 0
    for (let i = 0; i < this.urls.length; i++) {
      const w = window.open(this.urls[i], "_blank")
      if (!w) blocked++
      if (this.delay && i < this.urls.length - 1) await this.sleep(this.delay)
    }
    if (blocked > 0) this.toast(`${blocked} tab(s) blocked — allow pop-ups for this site.`)
  }

  async save () {
    if (this.urls.length === 0) return
    this.saveBtnTarget.disabled = true
    this.saveBtnTarget.textContent = "Saving…"
    try {
      const body = new FormData()
      body.append("urls", this.urls.join("\n"))
      if (this.hasNameInputTarget && this.nameInputTarget.value.trim()) {
        body.append("name", this.slugify(this.nameInputTarget.value.trim()))
      }
      const res = await fetch("/o", {
        method: "POST",
        headers: { "X-CSRF-Token": this.csrf(), Accept: "application/json" },
        body
      })
      if (!res.ok) throw new Error("save failed")
      const data = await res.json()
      window.location.href = data.url
    } catch (err) {
      this.toast("Couldn't save — try again.")
      this.saveBtnTarget.disabled = false
      this.saveBtnTarget.textContent = "Save"
    }
  }

  loadExample () {
    if (!this.hasTextareaTarget) return
    this.textareaTarget.value = [
      "# monday morning check-ins",
      "github.com",
      "linear.app",
      "- https://mail.google.com",
      "[Docs](https://docs.google.com)",
      "news.ycombinator.com, example.com"
    ].join("\n")
    this.parse()
  }

  clear () {
    if (this.hasTextareaTarget) this.textareaTarget.value = ""
    this.urls = []
    this.render()
  }

  copyShare (e) {
    const url = e.currentTarget.dataset.url || location.href
    navigator.clipboard.writeText(url).then(() => this.toast("Link copied"))
  }

  slugify (s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30)
  }

  escape (s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
  }

  sleep (ms) { return new Promise((r) => setTimeout(r, ms)) }

  toast (msg) {
    const t = document.createElement("div")
    t.className = "tb-toast"
    t.textContent = msg
    document.body.appendChild(t)
    setTimeout(() => t.remove(), 2200)
  }

  csrf () {
    const el = document.querySelector('meta[name="csrf-token"]')
    return el ? el.content : ""
  }
}
