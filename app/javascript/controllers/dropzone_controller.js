import { Controller } from "@hotwired/stimulus"

// Generic visual dropzone helper — adds/removes .is-active on the target.
// The consuming controller handles the actual `drop` event itself.
export default class extends Controller {
  static targets = ["zone"]

  over (e) {
    if (e.cancelable) e.preventDefault()
    this.zoneTargets.forEach((z) => z.classList.add("is-active"))
  }

  leave (e) {
    // Only clear when leaving the window (relatedTarget null) to avoid flicker.
    if (e && e.relatedTarget) return
    this.zoneTargets.forEach((z) => z.classList.remove("is-active"))
  }
}
