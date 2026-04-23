import { Controller } from "@hotwired/stimulus"

// Polls the current board every interval-value ms, morphs the table in place.
export default class extends Controller {
  static targets = ["tableWrap", "refreshBtn", "shareInput", "lastCheckedRel", "upCount", "slowCount", "downCount"]
  static values  = { slug: String, interval: { type: Number, default: 60000 } }

  connect () {
    this.timer = setInterval(() => this.poll(), this.intervalValue)
  }

  disconnect () {
    clearInterval(this.timer)
  }

  async refresh (e) {
    if (e) e.preventDefault()
    this.refreshBtnTarget.disabled = true
    this.refreshBtnTarget.textContent = "Checking…"
    try {
      await fetch(`/down/b/${this.slugValue}/recheck`, {
        method: "POST",
        headers: { "X-CSRF-Token": this.csrf() }
      }).catch(() => {})
      setTimeout(() => this.poll(), 1200)
    } finally {
      setTimeout(() => {
        this.refreshBtnTarget.disabled = false
        this.refreshBtnTarget.textContent = "Check now"
      }, 1500)
    }
  }

  async poll () {
    try {
      const res = await fetch(`/down/b/${this.slugValue}.json`, { headers: { Accept: "application/json" } })
      if (!res.ok) return
      const data = await res.json()
      if (data.tableHtml) this.tableWrapTarget.innerHTML = data.tableHtml
      if (data.counts) {
        if (this.hasUpCountTarget)   this.upCountTarget.textContent   = data.counts.up
        if (this.hasSlowCountTarget) this.slowCountTarget.textContent = data.counts.slow
        if (this.hasDownCountTarget) this.downCountTarget.textContent = data.counts.down
      }
      if (data.lastCheckedRel && this.hasLastCheckedRelTarget) {
        this.lastCheckedRelTarget.textContent = data.lastCheckedRel
      }
    } catch (_) {}
  }

  copyShare () {
    if (!this.hasShareInputTarget) return
    this.shareInputTarget.select()
    navigator.clipboard.writeText(this.shareInputTarget.value).then(() => {
      this.flashToast("Link copied")
    })
  }

  flashToast (msg) {
    const t = document.createElement("div")
    t.className = "tb-toast"
    t.textContent = msg
    document.body.appendChild(t)
    setTimeout(() => t.remove(), 1800)
  }

  csrf () {
    const el = document.querySelector('meta[name="csrf-token"]')
    return el ? el.content : ""
  }
}
