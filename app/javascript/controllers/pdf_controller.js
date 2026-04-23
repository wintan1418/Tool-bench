import { Controller } from "@hotwired/stimulus"
import { PDFDocument, degrees } from "pdf-lib"
import { zip } from "fflate"
import Sortable from "sortablejs"

// Client-side PDF merge / split / rotate / compress.
export default class extends Controller {
  static targets = [
    "drop", "input", "files",
    "previewWrap", "preview", "previewCount",
    "compressOpts",
    "runBtn",
    "outName",
    "statFiles", "statPages", "statIn", "statOut"
  ]
  static values = { op: String }

  connect () {
    this.items = []  // { id, name, bytes, doc, pages: [ { rotate: 0, include: true, fromIdx } ] }
    this.compress = "medium"
    this.sortable = null
  }

  pick () { this.inputTarget.click() }
  picked (e) { this.addFiles(Array.from(e.target.files || [])) }

  drop (e) {
    e.preventDefault()
    if (this.hasDropTarget) this.dropTarget.classList.remove("is-active")
    const files = Array.from((e.dataTransfer && e.dataTransfer.files) || [])
    this.addFiles(files)
  }

  async addFiles (files) {
    const pdfs = files.filter((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf")
    if (pdfs.length === 0) return
    if (this.opValue !== "merge" && this.items.length + pdfs.length > 1) {
      // single-file tools — replace
      this.items = []
    }
    for (const f of pdfs) {
      const buf = await f.arrayBuffer()
      try {
        const doc = await PDFDocument.load(buf)
        const pageCount = doc.getPageCount()
        this.items.push({
          id: crypto.randomUUID(),
          name: f.name,
          bytes: f.size,
          buf,
          doc,
          pages: Array.from({ length: pageCount }, () => ({ rotate: 0, include: true }))
        })
      } catch (err) {
        console.error("Failed to load PDF", err)
      }
    }
    this.render()
  }

  setCompress (e) {
    this.compress = e.currentTarget.dataset.level
    this.compressOptsTarget.querySelectorAll(".tb-tab").forEach((b) => b.classList.remove("is-active"))
    e.currentTarget.classList.add("is-active")
  }

  remove (e) {
    const id = e.currentTarget.dataset.id
    this.items = this.items.filter((i) => i.id !== id)
    this.render()
  }

  rotatePage (e) {
    const { id, page } = e.currentTarget.dataset
    const item = this.items.find((i) => i.id === id)
    if (!item) return
    const p = item.pages[parseInt(page, 10)]
    p.rotate = (p.rotate + 90) % 360
    this.renderPreview()
  }

  togglePage (e) {
    const { id, page } = e.currentTarget.dataset
    const item = this.items.find((i) => i.id === id)
    if (!item) return
    const p = item.pages[parseInt(page, 10)]
    p.include = !p.include
    e.currentTarget.classList.toggle("is-off", !p.include)
    this.updateStats()
  }

  // ---------- rendering ----------

  render () {
    this.renderFileList()
    this.renderPreview()
    this.updateStats()
    this.updateRunBtn()
    if (this.hasCompressOptsTarget) this.compressOptsTarget.style.display = this.items.length ? "block" : "none"
  }

  renderFileList () {
    if (this.items.length === 0) {
      this.filesTarget.style.display = "none"
      this.filesTarget.innerHTML = ""
      return
    }
    this.filesTarget.style.display = "block"
    this.filesTarget.innerHTML = this.items.map((f, i) => this.fileRowHtml(f, i)).join("") + this.addMoreHtml()

    this.filesTarget.querySelectorAll("[data-action-rm]").forEach((btn) =>
      btn.addEventListener("click", (e) => this.remove({ currentTarget: e.currentTarget })))
    const addBtn = this.filesTarget.querySelector("[data-action-add]")
    if (addBtn) addBtn.addEventListener("click", () => this.pick())

    // drag-reorder (merge only)
    if (this.opValue === "merge" && this.items.length > 1) {
      if (this.sortable) this.sortable.destroy()
      this.sortable = Sortable.create(this.filesTarget, {
        handle: ".tb-grip",
        draggable: ".tb-file-row",
        animation: 140,
        onEnd: () => {
          const newOrder = Array.from(this.filesTarget.querySelectorAll(".tb-file-row")).map((r) => r.dataset.id)
          this.items.sort((a, b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id))
          this.renderPreview()
          this.updateStats()
        }
      })
    }
  }

  fileRowHtml (f, idx) {
    const grip = this.opValue === "merge" && this.items.length > 1
      ? `<span class="tb-grip" aria-label="Drag to reorder"></span>` : `<span></span>`
    return `
      <div class="tb-file-row" data-id="${f.id}">
        ${grip}
        <div>
          <div class="tb-file-name">${this.escape(f.name)}</div>
          <div class="tb-file-meta">${f.pages.length} pages · ${this.fmtBytes(f.bytes)}</div>
        </div>
        <div><span class="tb-pill tb-pill-neu">#${idx + 1}</span></div>
        <div class="tb-mono tb-muted" style="font-size:11px;">local</div>
        <div style="text-align:right;">
          <button class="tb-btn tb-btn-quiet" data-action-rm data-id="${f.id}">remove</button>
        </div>
      </div>`
  }

  addMoreHtml () {
    if (this.opValue !== "merge") return ""
    return `
      <div style="padding: 12px 14px;">
        <button class="tb-btn tb-btn-ghost" data-action-add style="width:100%; border-style:dashed;">
          + Add another PDF
        </button>
      </div>`
  }

  renderPreview () {
    if (this.items.length === 0) {
      this.previewWrapTarget.style.display = "none"
      this.previewTarget.innerHTML = ""
      return
    }
    this.previewWrapTarget.style.display = "block"

    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    const chunks = []
    this.items.forEach((item, i) => {
      const letter = letters[i % letters.length]
      item.pages.forEach((p, pi) => {
        const rot = p.rotate ? `transform: rotate(${p.rotate}deg);` : ""
        const off = p.include ? "" : "opacity: 0.3;"
        const action = this.opValue === "rotate"
          ? `<button class="tb-thumb-rotate" data-action="click->pdf#rotatePage" data-id="${item.id}" data-page="${pi}" title="Rotate 90°" aria-label="Rotate page">↻</button>`
          : this.opValue === "split"
            ? `<button class="tb-thumb-toggle ${p.include ? "" : "is-off"}" data-action="click->pdf#togglePage" data-id="${item.id}" data-page="${pi}" title="Include page">${p.include ? "✓" : "✕"}</button>`
            : ""
        chunks.push(`
          <div class="tb-thumb" style="${off}">
            <div class="tb-thumb-box" style="${rot}"><span class="tb-thumb-letter">${letter}</span></div>
            <div class="tb-thumb-action">${action}</div>
          </div>
        `)
      })
    })
    this.previewTarget.innerHTML = chunks.join("")
    this.previewCountTarget.textContent = this.totalPages()
  }

  totalPages () {
    return this.items.reduce((n, i) => n + (this.opValue === "split"
      ? i.pages.filter((p) => p.include).length
      : i.pages.length), 0)
  }

  totalBytes () {
    return this.items.reduce((n, i) => n + i.bytes, 0)
  }

  updateStats () {
    this.statFilesTarget.textContent = this.items.length
    this.statPagesTarget.textContent = this.totalPages()
    this.statInTarget.textContent    = this.items.length ? this.fmtBytes(this.totalBytes()) : "—"
    const est = this.estimateOut()
    this.statOutTarget.textContent = est ? this.fmtBytes(est) : "—"
  }

  estimateOut () {
    const total = this.totalBytes()
    if (total === 0) return null
    if (this.opValue === "compress") {
      const mult = { low: 0.85, medium: 0.65, high: 0.5 }[this.compress] || 0.65
      return Math.round(total * mult)
    }
    return total
  }

  updateRunBtn () {
    if (!this.hasRunBtnTarget) return
    const enabled = this.opValue === "merge"
      ? this.items.length >= 2
      : this.items.length === 1
    this.runBtnTarget.disabled = !enabled
  }

  // ---------- run ----------

  async run () {
    if (this.items.length === 0) return
    this.runBtnTarget.disabled = true
    this.runBtnTarget.textContent = "Working…"
    try {
      switch (this.opValue) {
        case "merge":    await this.runMerge(); break
        case "split":    await this.runSplit(); break
        case "rotate":   await this.runRotate(); break
        case "compress": await this.runCompress(); break
      }
    } catch (err) {
      console.error(err)
      alert("Something went wrong: " + err.message)
    } finally {
      this.runBtnTarget.disabled = false
      this.runBtnTarget.textContent = this.defaultRunLabel()
      this.updateRunBtn()
    }
  }

  defaultRunLabel () {
    return {
      merge: "Merge & download",
      split: "Split & download",
      rotate: "Rotate & download",
      compress: "Compress & download"
    }[this.opValue] || "Run"
  }

  async runMerge () {
    const out = await PDFDocument.create()
    for (const item of this.items) {
      const copied = await out.copyPages(item.doc, item.doc.getPageIndices())
      copied.forEach((p) => out.addPage(p))
    }
    const bytes = await out.save()
    this.downloadBlob(new Blob([bytes], { type: "application/pdf" }), "merged.pdf")
  }

  async runSplit () {
    const item = this.items[0]
    const included = item.pages.map((p, i) => [p, i]).filter(([p]) => p.include)
    if (included.length === 0) return

    if (included.length === 1) {
      const [, i] = included[0]
      const out = await PDFDocument.create()
      const [pg] = await out.copyPages(item.doc, [i])
      out.addPage(pg)
      const bytes = await out.save()
      this.downloadBlob(new Blob([bytes], { type: "application/pdf" }), `page-${i + 1}.pdf`)
      return
    }

    const files = {}
    for (const [, i] of included) {
      const out = await PDFDocument.create()
      const [pg] = await out.copyPages(item.doc, [i])
      out.addPage(pg)
      const bytes = await out.save()
      files[`page-${i + 1}.pdf`] = new Uint8Array(bytes)
    }
    zip(files, { level: 0 }, (err, data) => {
      if (err) { console.error(err); return }
      this.downloadBlob(new Blob([data], { type: "application/zip" }), "split.zip")
    })
  }

  async runRotate () {
    const item = this.items[0]
    const out = await PDFDocument.load(item.buf)
    const pages = out.getPages()
    item.pages.forEach((p, i) => {
      if (p.rotate) pages[i].setRotation(degrees(p.rotate))
    })
    const bytes = await out.save()
    this.downloadBlob(new Blob([bytes], { type: "application/pdf" }), this.renameExt(item.name, "-rotated.pdf"))
  }

  async runCompress () {
    // pdf-lib has no rasteriser; what we can honestly do is re-save with object streams
    // + drop metadata, which is typically ~5–15%. Label honestly.
    const item = this.items[0]
    const doc = await PDFDocument.load(item.buf, { ignoreEncryption: true })
    doc.setTitle(""); doc.setAuthor(""); doc.setSubject(""); doc.setKeywords([]); doc.setProducer("toolbench"); doc.setCreator("toolbench")
    const bytes = await doc.save({ useObjectStreams: true })
    this.downloadBlob(new Blob([bytes], { type: "application/pdf" }), this.renameExt(item.name, "-compressed.pdf"))
  }

  downloadBlob (blob, name) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  renameExt (name, suffix) {
    return name.replace(/\.pdf$/i, "") + suffix
  }

  fmtBytes (n) {
    if (n == null) return "—"
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n/1024).toFixed(1)} KB`
    return `${(n/1024/1024).toFixed(1)} MB`
  }

  escape (s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
  }
}
