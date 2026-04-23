import { Controller } from "@hotwired/stimulus"
import { zip } from "fflate"

// In-browser image compressor. Draws the source image to a canvas at a target
// size, then uses canvas.toBlob to re-encode at the chosen quality. No upload.
export default class extends Controller {
  static targets = [
    "drop", "input", "options", "list", "zipBtn",
    "quality", "maxdim", "format",
    "queued", "done", "saved"
  ]

  connect () {
    this.files = []  // { id, file, name, type, size, status, outBlob, outSize, ext }
    this.quality = 0.8
    this.maxDim  = 0        // 0 = original
    this.format  = "auto"   // auto | image/jpeg | image/webp
    this.processing = false
  }

  pick () { this.inputTarget.click() }
  picked (e) { this.addFiles(Array.from(e.target.files || [])) }

  drop (e) {
    e.preventDefault()
    if (this.hasDropTarget) this.dropTarget.classList.remove("is-active")
    this.addFiles(Array.from((e.dataTransfer && e.dataTransfer.files) || []))
  }

  addFiles (files) {
    const imgs = files.filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type))
    if (imgs.length === 0) return
    for (const f of imgs) {
      this.files.push({
        id: crypto.randomUUID(),
        file: f,
        name: f.name,
        type: f.type,
        size: f.size,
        status: "queue",
        outBlob: null,
        outSize: null,
        ext: null
      })
    }
    this.optionsTarget.hidden = false
    this.render()
    this.processNext()
  }

  setQuality (e) { this.selectTab(this.qualityTarget, e.currentTarget); this.quality = parseFloat(e.currentTarget.dataset.q) }
  setMaxDim  (e) { this.selectTab(this.maxdimTarget,  e.currentTarget); this.maxDim  = parseInt(e.currentTarget.dataset.m, 10) }
  setFormat  (e) { this.selectTab(this.formatTarget,  e.currentTarget); this.format  = e.currentTarget.dataset.f }

  selectTab (group, active) {
    group.querySelectorAll(".tb-tab").forEach((b) => b.classList.remove("is-active"))
    active.classList.add("is-active")
  }

  clear () {
    this.files = []
    this.listTarget.style.display = "none"
    this.listTarget.innerHTML = ""
    this.optionsTarget.hidden = true
    this.zipBtnTarget.disabled = true
    this.render()
  }

  // Re-process all files with the current settings.
  reprocess () {
    this.files.forEach((f) => {
      f.status = "queue"
      f.outBlob = null
      f.outSize = null
    })
    this.render()
    this.processNext()
  }

  async processNext () {
    if (this.processing) return
    const next = this.files.find((f) => f.status === "queue")
    if (!next) return
    this.processing = true
    next.status = "work"
    this.render()

    try {
      const { blob, ext, mime } = await this.compress(next)
      next.outBlob = blob
      next.outSize = blob.size
      next.ext = ext
      next.mime = mime
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

  async compress (item) {
    // Decode.
    const bitmap = await (self.createImageBitmap
      ? createImageBitmap(item.file)
      : this.imageFromFile(item.file))

    // Figure out target dimensions.
    const srcW = bitmap.width
    const srcH = bitmap.height
    let dstW = srcW
    let dstH = srcH
    if (this.maxDim > 0 && Math.max(srcW, srcH) > this.maxDim) {
      const ratio = this.maxDim / Math.max(srcW, srcH)
      dstW = Math.round(srcW * ratio)
      dstH = Math.round(srcH * ratio)
    }

    // Figure out target mime.
    let mime = this.format
    if (mime === "auto") {
      mime = item.type === "image/png" ? "image/webp" : item.type
    }

    const canvas = this.makeCanvas(dstW, dstH)
    const ctx = canvas.getContext("2d")
    // White fill if dropping transparency (i.e. PNG → JPG).
    if (mime === "image/jpeg" && item.type === "image/png") {
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, dstW, dstH)
    }
    ctx.drawImage(bitmap, 0, 0, dstW, dstH)

    const blob = await this.canvasToBlob(canvas, mime, this.quality)
    const ext = mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp"
    return { blob, ext, mime }
  }

  makeCanvas (w, h) {
    if (typeof OffscreenCanvas !== "undefined") {
      return new OffscreenCanvas(w, h)
    }
    const c = document.createElement("canvas")
    c.width = w
    c.height = h
    return c
  }

  canvasToBlob (canvas, mime, quality) {
    if (canvas instanceof OffscreenCanvas) {
      return canvas.convertToBlob({ type: mime, quality })
    }
    return new Promise((resolve, reject) => {
      canvas.toBlob((b) => b ? resolve(b) : reject(new Error("toBlob failed")), mime, quality)
    })
  }

  imageFromFile (file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
      img.onerror = reject
      img.src = url
    })
  }

  updateZipBtn () {
    this.zipBtnTarget.disabled = !this.files.some((f) => f.status === "done")
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
      this.triggerDownload(new Blob([data], { type: "application/zip" }), "compressed-images.zip")
    })
  }

  downloadOne (e) {
    const f = this.files.find((x) => x.id === e.currentTarget.dataset.id)
    if (!f || !f.outBlob) return
    this.triggerDownload(f.outBlob, this.renameFile(f.name, f.ext))
  }

  removeOne (e) {
    this.files = this.files.filter((f) => f.id !== e.currentTarget.dataset.id)
    if (this.files.length === 0) this.clear()
    else this.render()
  }

  triggerDownload (blob, name) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = name
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  renameFile (name, ext) {
    return name.replace(/\.[^.]+$/, `.${ext}`)
  }

  render () {
    if (this.files.length === 0) {
      this.listTarget.style.display = "none"
      this.listTarget.innerHTML = ""
      if (this.hasQueuedTarget) this.queuedTarget.textContent = "0"
      if (this.hasDoneTarget)   this.doneTarget.textContent   = "0"
      if (this.hasSavedTarget)  this.savedTarget.textContent  = "0"
      return
    }
    this.listTarget.style.display = "block"
    this.listTarget.innerHTML = this.files.map((f) => this.rowHtml(f)).join("")

    this.listTarget.querySelectorAll("[data-action-dl]").forEach((btn) =>
      btn.addEventListener("click", (e) => this.downloadOne({ currentTarget: e.currentTarget })))
    this.listTarget.querySelectorAll("[data-action-rm]").forEach((btn) =>
      btn.addEventListener("click", (e) => this.removeOne({ currentTarget: e.currentTarget })))

    if (this.hasQueuedTarget) this.queuedTarget.textContent = this.files.filter((f) => f.status === "queue" || f.status === "work").length
    if (this.hasDoneTarget)   this.doneTarget.textContent   = this.files.filter((f) => f.status === "done").length

    const saved = this.files.reduce((n, f) => f.outSize != null ? n + Math.max(0, f.size - f.outSize) : n, 0)
    if (this.hasSavedTarget) this.savedTarget.textContent = this.fmtBytes(saved)
  }

  rowHtml (f) {
    const typeLabel = (f.type.split("/")[1] || "IMG").toUpperCase().slice(0, 4)
    const sizeMeta = f.outSize != null
      ? `${this.fmtBytes(f.size)} → ${this.fmtBytes(f.outSize)} · ${this.pctDelta(f.size, f.outSize)}`
      : this.fmtBytes(f.size)

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
        <span class="tb-file-thumb">${typeLabel}</span>
        <div>
          <div class="tb-file-name">${this.escape(f.name)}</div>
          <div class="tb-file-meta">${sizeMeta}</div>
        </div>
        <div>${status}</div>
        <div class="tb-mono tb-muted" style="font-size:11px;">local</div>
        <div style="text-align:right;">${action}</div>
      </div>
    `
  }

  pctDelta (before, after) {
    if (!before) return ""
    const d = Math.round(((before - after) / before) * 100)
    const color = d > 0 ? "var(--tb-green)" : "var(--tb-red)"
    const sign = d > 0 ? "−" : "+"
    return `<span style="color: ${color};">${sign}${Math.abs(d)}%</span>`
  }

  fmtBytes (n) {
    if (n == null) return ""
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n/1024).toFixed(1)} KB`
    return `${(n/1024/1024).toFixed(2)} MB`
  }

  escape (s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
  }
}
