import { Controller } from "@hotwired/stimulus"

// Reads browser resource timing to verify, in real time, that no network request has
// been sent back to our origin during a client-side operation. Writes the byte count
// into every [data-receipt-target="bytes"] element on the page.
export default class extends Controller {
  static targets = ["bytes", "requests", "compact"]

  connect () {
    this.origin = location.origin
    this.tick()
    this.interval = setInterval(() => this.tick(), 1500)
  }

  disconnect () {
    clearInterval(this.interval)
  }

  tick () {
    if (!("performance" in window) || !performance.getEntriesByType) return
    const entries = performance.getEntriesByType("resource")
    let bytes = 0
    let count = 0
    for (const e of entries) {
      if (!e.name.startsWith(this.origin)) continue
      // Skip our own app bundle / stylesheet — those are the page load itself.
      if (e.initiatorType === "script" || e.initiatorType === "link") continue
      if (e.initiatorType === "xmlhttprequest" || e.initiatorType === "fetch") {
        count += 1
        bytes += e.transferSize || 0
      }
    }
    this.bytesTargets.forEach((el) => el.textContent = bytes.toLocaleString())
    if (this.hasRequestsTarget) this.requestsTarget.textContent = count.toLocaleString()
  }
}
