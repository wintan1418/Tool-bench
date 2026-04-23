import { Controller } from "@hotwired/stimulus"
import { PDFDocument } from "pdf-lib"

// Sign PDF — client-side.
// Flow:
//  1) user drops PDF → we render each page to a <canvas> preview at a reasonable width
//  2) user draws / types / uploads a signature → stored as a PNG data-url
//  3) user clicks on a page preview → we place a draggable signature box there
//  4) user clicks "Stamp & download" → pdf-lib embeds the PNG at the corresponding
//     coordinate on the real PDF page, saves the file, triggers download
export default class extends Controller {
  static targets = [
    "drop", "pdfInput", "pagesWrap", "pages",
    "modeTabs", "drawPanel", "typePanel", "uploadPanel",
    "canvas", "inkColor", "typeText", "sigInput",
    "downloadBtn"
  ]

  connect () {
    this.pdfBuffer = null
    this.pdfDoc    = null             // pdf-lib doc
    this.pageInfos = []               // { w, h, canvasEl, placements: [ {x,y,w,h} relative to canvas, el } ]
    this.signature = null             // PNG data-url
    this.mode      = "draw"
    this.drawing   = false
    this.ink       = "#0f172a"
    this.initPad()
  }

  // ----- signature pad -----

  initPad () {
    const c = this.canvasTarget
    // Resize canvas backing store to match layout × DPR.
    const fit = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = c.getBoundingClientRect()
      c.width  = Math.floor(rect.width * dpr)
      c.height = Math.floor(rect.height * dpr)
      const ctx = c.getContext("2d")
      ctx.scale(dpr, dpr)
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      ctx.lineWidth = 2.2
    }
    fit()
    window.addEventListener("resize", fit)

    const start = (e) => { this.drawing = true; const p = this.padPoint(e); this.lastP = p }
    const move  = (e) => {
      if (!this.drawing) return
      const ctx = c.getContext("2d"); ctx.strokeStyle = this.ink
      const p = this.padPoint(e)
      ctx.beginPath(); ctx.moveTo(this.lastP.x, this.lastP.y); ctx.lineTo(p.x, p.y); ctx.stroke()
      this.lastP = p
    }
    const end   = () => { if (this.drawing) { this.drawing = false; this.captureSigFromCanvas() } }

    c.addEventListener("pointerdown", (e) => { c.setPointerCapture(e.pointerId); start(e) })
    c.addEventListener("pointermove", move)
    c.addEventListener("pointerup",   end)
    c.addEventListener("pointercancel", end)
  }

  padPoint (e) {
    const rect = this.canvasTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  changeColor () { this.ink = this.inkColorTarget.value }

  clearPad () {
    const c = this.canvasTarget
    c.getContext("2d").clearRect(0, 0, c.width, c.height)
    this.signature = null
    this.updateDownloadBtn()
  }

  captureSigFromCanvas () {
    // Crop to opaque pixels for a tight signature, then export as PNG.
    const c = this.canvasTarget
    const { data, width, height } = c.getContext("2d").getImageData(0, 0, c.width, c.height)
    let minX = width, minY = height, maxX = 0, maxY = 0, any = false
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const a = data[(y * width + x) * 4 + 3]
        if (a > 8) { any = true
          if (x < minX) minX = x; if (y < minY) minY = y
          if (x > maxX) maxX = x; if (y > maxY) maxY = y
        }
      }
    }
    if (!any) { this.signature = null; return }
    const pad = 6
    const cx = Math.max(0, minX - pad), cy = Math.max(0, minY - pad)
    const cw = Math.min(width,  maxX + pad) - cx
    const ch = Math.min(height, maxY + pad) - cy
    const crop = document.createElement("canvas"); crop.width = cw; crop.height = ch
    crop.getContext("2d").drawImage(c, cx, cy, cw, ch, 0, 0, cw, ch)
    this.signature = crop.toDataURL("image/png")
    this.updateDownloadBtn()
  }

  // ----- mode switching -----

  mode (e) {
    this.mode = e.currentTarget.dataset.mode
    this.modeTabsTarget.querySelectorAll(".tb-tab").forEach((b) => b.classList.remove("is-active"))
    e.currentTarget.classList.add("is-active")
    this.drawPanelTarget.hidden   = this.mode !== "draw"
    this.typePanelTarget.hidden   = this.mode !== "type"
    this.uploadPanelTarget.hidden = this.mode !== "upload"
  }

  typedSig () {
    const text = (this.typeTextTarget.value || "").trim()
    if (!text) { this.signature = null; this.updateDownloadBtn(); return }
    const c = document.createElement("canvas"); c.width = 520; c.height = 180
    const ctx = c.getContext("2d")
    ctx.fillStyle = this.ink
    ctx.font = "italic 500 52px \"Source Serif 4\", \"Segoe Script\", Georgia, serif"
    ctx.textBaseline = "middle"
    ctx.fillText(text, 10, 100)
    this.signature = c.toDataURL("image/png")
    this.updateDownloadBtn()
  }

  async uploadedSig () {
    const file = this.sigInputTarget.files[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    const img = await this.loadImage(url)
    URL.revokeObjectURL(url)
    const c = document.createElement("canvas")
    const maxW = 520, scale = Math.min(1, maxW / img.width)
    c.width = img.width * scale; c.height = img.height * scale
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height)
    this.signature = c.toDataURL("image/png")
    this.updateDownloadBtn()
  }

  // ----- PDF handling -----

  pick () { this.pdfInputTarget.click() }
  picked (e) { this.loadPdf(e.target.files[0]) }

  drop (e) {
    e.preventDefault()
    if (this.hasDropTarget) this.dropTarget.classList.remove("is-active")
    const f = (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0])
    if (f) this.loadPdf(f)
  }

  async loadPdf (file) {
    if (!file || !/\.pdf$/i.test(file.name)) return
    this.pdfBuffer = await file.arrayBuffer()
    this.pdfDoc = await PDFDocument.load(this.pdfBuffer)

    this.pageInfos = []
    this.pagesWrapTarget.style.display = "block"
    this.pagesTarget.innerHTML = ""

    // For previews we don't need a full raster — pdf-lib can't raster — so we draw a
    // neutral card with the page size ratio and label it. That's enough to let the user
    // place a signature. (For a richer preview we'd need pdf.js; intentionally skipping.)
    const pages = this.pdfDoc.getPages()
    pages.forEach((p, i) => {
      const w = p.getWidth(), h = p.getHeight()
      const container = document.createElement("div")
      container.className = "tb-sign-page"
      container.style.cssText = `position: relative; background: var(--tb-paper); border: 1px solid var(--tb-line-2); border-radius: 6px; width: 100%; aspect-ratio: ${w}/${h}; overflow: hidden; cursor: crosshair;`
      container.innerHTML = `
        <div class="tb-mono" style="position:absolute; top: 8px; left: 10px; font-size: 10px; color: var(--tb-muted);">Page ${i + 1}</div>
        <div class="tb-mono" style="position:absolute; top: 8px; right: 10px; font-size: 10px; color: var(--tb-muted);">${Math.round(w)} × ${Math.round(h)} pt</div>
      `
      container.addEventListener("click", (ev) => this.placeSignatureOn(container, i, ev))
      this.pagesTarget.appendChild(container)
      this.pageInfos.push({ w, h, el: container, placements: [] })
    })

    this.updateDownloadBtn()
  }

  placeSignatureOn (container, pageIdx, ev) {
    if (!this.signature) { this.toast("Draw, type, or upload a signature first."); return }
    const rect = container.getBoundingClientRect()
    const relX = (ev.clientX - rect.left) / rect.width
    const relY = (ev.clientY - rect.top)  / rect.height

    const info = this.pageInfos[pageIdx]
    // default signature box: 160 pt wide, keep aspect
    const sigImg = new Image()
    sigImg.onload = () => {
      const aspect = sigImg.height / sigImg.width
      const sigW = 160 / info.w  // relative width on the page
      const sigH = sigW * aspect * (info.w / info.h)
      const box = this.spawnBox(container, relX - sigW / 2, relY - sigH / 2, sigW, sigH, this.signature)
      info.placements.push(box)
      this.updateDownloadBtn()
    }
    sigImg.src = this.signature
  }

  spawnBox (container, x, y, w, h, imgSrc) {
    const box = document.createElement("div")
    box.className = "tb-sign-box"
    box.style.cssText = `position: absolute; left: ${x * 100}%; top: ${y * 100}%; width: ${w * 100}%; height: ${h * 100}%; background-image: url(${imgSrc}); background-size: contain; background-repeat: no-repeat; background-position: center; border: 1px dashed transparent;`
    const rm = document.createElement("button")
    rm.textContent = "×"; rm.className = "tb-sign-rm"
    rm.style.cssText = "position:absolute; top:-10px; right:-10px; width:20px; height:20px; border-radius:999px; background: var(--tb-ink); color: #fff; border:0; cursor:pointer;"
    box.appendChild(rm)

    box.addEventListener("mouseenter", () => { box.style.border = "1px dashed var(--tb-red)" })
    box.addEventListener("mouseleave", () => { box.style.border = "1px dashed transparent" })

    // Drag
    let dragStart = null
    box.addEventListener("pointerdown", (ev) => {
      if (ev.target === rm) return
      ev.stopPropagation()
      dragStart = { x: ev.clientX, y: ev.clientY, left: parseFloat(box.style.left), top: parseFloat(box.style.top) }
      box.setPointerCapture(ev.pointerId)
    })
    box.addEventListener("pointermove", (ev) => {
      if (!dragStart) return
      const rect = container.getBoundingClientRect()
      const dx = (ev.clientX - dragStart.x) / rect.width  * 100
      const dy = (ev.clientY - dragStart.y) / rect.height * 100
      box.style.left = `${dragStart.left + dx}%`
      box.style.top  = `${dragStart.top + dy}%`
    })
    box.addEventListener("pointerup",   () => { dragStart = null })
    box.addEventListener("pointercancel", () => { dragStart = null })

    rm.addEventListener("click", (ev) => { ev.stopPropagation(); box.remove(); this.updateDownloadBtn() })

    container.appendChild(box)
    return box
  }

  updateDownloadBtn () {
    const any = this.pageInfos.some((p) => p.placements.some((b) => b.isConnected))
    this.downloadBtnTarget.disabled = !(this.pdfDoc && this.signature && any)
  }

  async download () {
    if (!this.pdfDoc) return
    // Re-load a fresh copy so repeated downloads don't compound stamps.
    const pdf = await PDFDocument.load(this.pdfBuffer)
    const sigPngBytes = await this.pngDataUrlToBytes(this.signature)
    const sigImg = await pdf.embedPng(sigPngBytes)

    const pages = pdf.getPages()
    for (let i = 0; i < this.pageInfos.length; i++) {
      const info = this.pageInfos[i]
      const page = pages[i]
      const pw = page.getWidth(), ph = page.getHeight()
      for (const box of info.placements) {
        if (!box.isConnected) continue
        const leftPct = parseFloat(box.style.left) / 100
        const topPct  = parseFloat(box.style.top)  / 100
        const widthPct  = parseFloat(box.style.width)  / 100
        const heightPct = parseFloat(box.style.height) / 100
        const x = leftPct * pw
        const y = ph - (topPct + heightPct) * ph
        const w = widthPct * pw
        const h = heightPct * ph
        page.drawImage(sigImg, { x, y, width: w, height: h })
      }
    }

    const bytes = await pdf.save()
    const blob = new Blob([bytes], { type: "application/pdf" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url; a.download = "signed.pdf"
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  // ----- util -----

  loadImage (src) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
  }

  async pngDataUrlToBytes (url) {
    const res = await fetch(url)
    return new Uint8Array(await res.arrayBuffer())
  }

  toast (msg) {
    const t = document.createElement("div"); t.className = "tb-toast"; t.textContent = msg
    document.body.appendChild(t); setTimeout(() => t.remove(), 2200)
  }
}
