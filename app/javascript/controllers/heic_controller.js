import { Controller } from "@hotwired/stimulus"
import heic2any from "heic2any"
import { zip } from "fflate"

// HEIC → JPG/PNG/WebP. All in-browser. Queues files and processes sequentially
// (heic2any itself is heavy; parallelism doesn't help much on a single core).
export default class extends Controller {
  static targets = [
    "drop", "input", "options", "list", "zipBtn",
    "quality", "format",
    "bytesSent", "threads", "queued", "done"
  ]

  connect () {
    this.files = []  // { id, file, name, size, status, outSize, outBlob, ext }
    this.quality = 0.9
    this.format  = "image/jpeg"
    this.processing = false
    if (this.hasThreadsTarget) this.threadsTarget.textContent = "1"
  }

  pick () { this.inputTarget.click() }

  picked (e) { this.addFiles(Array.from(e.target.files || [])) }

  drop (e) {
    e.preventDefault()
    if (this.hasDropTarget) this.dropTarget.classList.remove("is-active")
    const items = (e.dataTransfer && e.dataTransfer.files) || []
    this.addFiles(Array.from(items))
  }

  addFiles (files) {
    const heic = files.filter((f) => /\.(heic|heif)$/i.test(f.name) || /heic|heif/i.test(f.type))
    if (heic.length === 0) return
    for (const f of heic) {
      this.files.push({
        id: crypto.randomUUID(),
        file: f,
        name: f.name,
        size: f.size,
        status: "queue",
        outSize: null,
        outBlob: null,
        ext: null
      })
    }
    this.optionsTarget.hidden = false
    this.render()
    this.processNext()
  }

  setQuality (e) {
    this.quality = parseFloat(e.currentTarget.dataset.q)
    this.qualityTarget.querySelectorAll(".tb-tab").forEach((b) => b.classList.remove("is-active"))
    e.currentTarget.classList.add("is-active")
  }

  setFormat (e) {
    this.format = e.currentTarget.dataset.f
    this.formatTarget.querySelectorAll(".tb-tab").forEach((b) => b.classList.remove("is-active"))
    e.currentTarget.classList.add("is-active")
  }

  clear () {
    this.files = []
    this.render()
    this.listTarget.style.display = "none"
    this.optionsTarget.hidden = true
    this.zipBtnTarget.disabled = true
  }

  async processNext () {
    if (this.processing) return
    const next = this.files.find((f) => f.status === "queue")
    if (!next) return
    this.processing = true
    next.status = "work"
    this.render()

    try {
      const result = await heic2any({
        blob: next.file,
        toType: this.format,
        quality: this.quality
      })
      const blob = Array.isArray(result) ? result[0] : result
      next.outBlob = blob
      next.outSize = blob.size
      next.ext = this.format === "image/jpeg" ? "jpg" :
                 this.format === "image/png"  ? "png" : "webp"
      next.status = "done"
    } catch (err) {
      console.error(err)
      next.status = "error"
    }
    this.processing = false
    this.render()
    this.updateZipBtn()
    this.processNext()
  }

  updateZipBtn () {
    const anyDone = this.files.some((f) => f.status === "done")
    this.zipBtnTarget.disabled = !anyDone
  }

  async downloadZip () {
    const done = this.files.filter((f) => f.status === "done")
    if (done.length === 0) return
    if (done.length === 1) {
      this.triggerDownload(done[0].outBlob, this.renameFile(done[0].name, done[0].ext))
      return
    }
    const buffers = {}
    for (const f of done) {
      const buf = new Uint8Array(await f.outBlob.arrayBuffer())
      buffers[this.renameFile(f.name, f.ext)] = [buf, { level: 0 }]
    }
    zip(buffers, { level: 0 }, (err, data) => {
      if (err) { console.error(err); return }
      const blob = new Blob([data], { type: "application/zip" })
      this.triggerDownload(blob, "heic-converted.zip")
    })
  }

  downloadOne (e) {
    const id = e.currentTarget.dataset.id
    const f = this.files.find((x) => x.id === id)
    if (!f || !f.outBlob) return
    this.triggerDownload(f.outBlob, this.renameFile(f.name, f.ext))
  }

  removeOne (e) {
    const id = e.currentTarget.dataset.id
    this.files = this.files.filter((f) => f.id !== id)
    this.render()
    if (this.files.length === 0) this.clear()
  }

  triggerDownload (blob, name) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  renameFile (name, ext) {
    return name.replace(/\.(heic|heif)$/i, `.${ext}`)
  }

  render () {
    if (this.files.length === 0) {
      this.listTarget.style.display = "none"
      this.listTarget.innerHTML = ""
      return
    }
    this.listTarget.style.display = "block"
    this.listTarget.innerHTML = this.files.map((f) => this.rowHtml(f)).join("")
    // wire per-row buttons
    this.listTarget.querySelectorAll("[data-action-dl]").forEach((btn) =>
      btn.addEventListener("click", (e) => this.downloadOne({ currentTarget: e.currentTarget })))
    this.listTarget.querySelectorAll("[data-action-rm]").forEach((btn) =>
      btn.addEventListener("click", (e) => this.removeOne({ currentTarget: e.currentTarget })))
    // counts
    if (this.hasQueuedTarget) this.queuedTarget.textContent = this.files.filter((f) => f.status === "queue" || f.status === "work").length
    if (this.hasDoneTarget)   this.doneTarget.textContent   = this.files.filter((f) => f.status === "done").length
  }

  rowHtml (f) {
    const meta = `${this.fmtBytes(f.size)}${f.outSize ? ` → ${this.fmtBytes(f.outSize)}` : ""}`
    let status = ""
    let action = ""
    if (f.status === "queue") {
      status = `<span class="tb-pill tb-pill-neu">queued</span>`
      action = `<button class="tb-btn tb-btn-quiet" data-action-rm data-id="${f.id}">remove</button>`
    } else if (f.status === "work") {
      status = `<div class="tb-progress"><div class="tb-progress-fill" style="width: 70%"></div></div>`
      action = `<span class="tb-mono tb-muted" style="font-size:11px;">working…</span>`
    } else if (f.status === "done") {
      status = `<span class="tb-pill tb-pill-ok">done</span>`
      action = `<button class="tb-btn tb-btn-ghost" data-action-dl data-id="${f.id}" style="height:30px;padding:0 10px;font-size:12px;">download</button>`
    } else {
      status = `<span class="tb-pill tb-pill-down">failed</span>`
      action = `<button class="tb-btn tb-btn-quiet" data-action-rm data-id="${f.id}">remove</button>`
    }
    return `
      <div class="tb-file-row">
        <span class="tb-file-thumb">HEIC</span>
        <div>
          <div class="tb-file-name">${this.escape(f.name)}</div>
          <div class="tb-file-meta">${meta}</div>
        </div>
        <div>${status}</div>
        <div class="tb-mono tb-muted" style="font-size:11px;">local</div>
        <div style="text-align:right;">${action}</div>
      </div>
    `
  }

  fmtBytes (n) {
    if (n == null) return ""
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n/1024).toFixed(1)} KB`
    return `${(n/1024/1024).toFixed(1)} MB`
  }

  escape (s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
  }
}
