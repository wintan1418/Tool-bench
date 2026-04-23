import { Controller } from "@hotwired/stimulus"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"

// Invoice maker — three templates, all rendered client-side with pdf-lib.
// State lives in `this.data`; every field edit updates `this.data`, re-renders
// the preview, and recomputes totals. Save POSTs JSON when signed in.
export default class extends Controller {
  static targets = [
    "templates", "items",
    "fNumber", "fCurrency", "fIssued", "fDue",
    "fFromName", "fFromAddress", "fFromEmail",
    "fToName", "fToAddress", "fToEmail",
    "fTax", "fNotes",
    "preview", "subtotal", "total"
  ]
  static values = {
    saved: Boolean,
    slug: String,
    signedIn: Boolean,
    seed: Object
  }

  connect () {
    this.data = Object.assign({
      number: "",
      template: "plain",
      currency: "USD",
      issued_on: this.today(),
      due_on: this.in14Days(),
      from_name: "",
      from_address: "",
      from_email: "",
      to_name: "",
      to_address: "",
      to_email: "",
      notes: "Thank you for your business.",
      tax_rate: 0,
      line_items: []
    }, this.seedValue || {})

    if (!this.data.line_items || this.data.line_items.length === 0) {
      this.data.line_items = [{ description: "", quantity: 1, unit_price: 0 }]
    }

    this.hydrateFields()
    this.renderItems()
    this.render()
  }

  // ----- field sync -----

  hydrateFields () {
    this.fNumberTarget.value     = this.data.number || ""
    this.fCurrencyTarget.value   = this.data.currency || "USD"
    this.fIssuedTarget.value     = this.data.issued_on || this.today()
    this.fDueTarget.value        = this.data.due_on || this.in14Days()
    this.fFromNameTarget.value   = this.data.from_name || ""
    this.fFromAddressTarget.value = this.data.from_address || ""
    this.fFromEmailTarget.value  = this.data.from_email || ""
    this.fToNameTarget.value     = this.data.to_name || ""
    this.fToAddressTarget.value  = this.data.to_address || ""
    this.fToEmailTarget.value    = this.data.to_email || ""
    this.fTaxTarget.value        = this.data.tax_rate || 0
    this.fNotesTarget.value      = this.data.notes || ""
    // activate template tab
    this.templatesTarget.querySelectorAll(".tb-tab").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.template === this.data.template)
    })
  }

  change () {
    this.data.number       = this.fNumberTarget.value
    this.data.currency     = this.fCurrencyTarget.value
    this.data.issued_on    = this.fIssuedTarget.value
    this.data.due_on       = this.fDueTarget.value
    this.data.from_name    = this.fFromNameTarget.value
    this.data.from_address = this.fFromAddressTarget.value
    this.data.from_email   = this.fFromEmailTarget.value
    this.data.to_name      = this.fToNameTarget.value
    this.data.to_address   = this.fToAddressTarget.value
    this.data.to_email     = this.fToEmailTarget.value
    this.data.tax_rate     = parseFloat(this.fTaxTarget.value) || 0
    this.data.notes        = this.fNotesTarget.value
    this.syncItems()
    this.render()
  }

  setTemplate (e) {
    this.data.template = e.currentTarget.dataset.template
    this.templatesTarget.querySelectorAll(".tb-tab").forEach((b) => b.classList.remove("is-active"))
    e.currentTarget.classList.add("is-active")
    this.render()
  }

  // ----- line items -----

  addItem () {
    this.data.line_items.push({ description: "", quantity: 1, unit_price: 0 })
    this.renderItems()
    this.render()
  }

  removeItem (e) {
    const idx = parseInt(e.currentTarget.dataset.idx, 10)
    this.data.line_items.splice(idx, 1)
    if (this.data.line_items.length === 0) this.addItem()
    this.renderItems()
    this.render()
  }

  syncItems () {
    this.itemsTarget.querySelectorAll("[data-row]").forEach((row) => {
      const idx = parseInt(row.dataset.row, 10)
      const desc = row.querySelector("[data-f=description]").value
      const qty  = parseFloat(row.querySelector("[data-f=quantity]").value) || 0
      const unit = parseFloat(row.querySelector("[data-f=unit_price]").value) || 0
      this.data.line_items[idx] = { description: desc, quantity: qty, unit_price: unit }
    })
  }

  renderItems () {
    this.itemsTarget.innerHTML = this.data.line_items.map((it, i) => `
      <div class="tb-file-row" data-row="${i}" style="grid-template-columns: 1fr 70px 100px 28px; gap: 8px; padding: 8px 0;">
        <input class="tb-input"        data-f="description" placeholder="Description"  value="${this.esc(it.description || "")}">
        <input class="tb-input tb-mono" data-f="quantity"    type="number" step="1" min="0" value="${it.quantity || 0}">
        <input class="tb-input tb-mono" data-f="unit_price"  type="number" step="0.01" min="0" value="${it.unit_price || 0}">
        <button class="tb-btn-icon" data-action="click->invoice#removeItem" data-idx="${i}" aria-label="Remove">×</button>
      </div>
    `).join("")
    this.itemsTarget.querySelectorAll("input").forEach((el) => {
      el.addEventListener("input", () => this.change())
    })
  }

  // ----- totals + preview -----

  subtotal () {
    return this.data.line_items.reduce((n, it) => n + (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0), 0)
  }

  taxAmount () { return this.subtotal() * ((parseFloat(this.data.tax_rate) || 0) / 100) }
  total     () { return this.subtotal() + this.taxAmount() }

  fmt (n) {
    const c = this.data.currency || "USD"
    try { return new Intl.NumberFormat("en-US", { style: "currency", currency: c }).format(n || 0) }
    catch (_) { return `${c} ${Number(n || 0).toFixed(2)}` }
  }

  render () {
    this.subtotalTarget.textContent = this.fmt(this.subtotal())
    this.totalTarget.textContent    = this.fmt(this.total())
    this.previewTarget.innerHTML    = this.previewHtml()
  }

  // HTML preview that mirrors each template's PDF layout at a smaller scale.
  previewHtml () {
    const d = this.data
    const items = d.line_items.map((it, i) => `
      <tr>
        <td style="padding: 6px 0;">${this.esc(it.description || "—")}</td>
        <td style="padding: 6px 0; text-align: right; font-family: var(--font-mono);">${it.quantity || 0}</td>
        <td style="padding: 6px 0; text-align: right; font-family: var(--font-mono);">${this.fmt(it.unit_price)}</td>
        <td style="padding: 6px 0; text-align: right; font-family: var(--font-mono);">${this.fmt((it.quantity || 0) * (it.unit_price || 0))}</td>
      </tr>`).join("")

    const headerByTemplate = {
      plain:   `<div style="border-bottom: 2px solid var(--tb-ink); padding-bottom: 10px; margin-bottom: 14px;">
                  <div style="font-size: 22px; font-weight: 600;">Invoice</div>
                  <div class="tb-mono" style="color: var(--tb-muted);">${this.esc(d.number || "")} · ${this.esc(d.issued_on || "")}</div>
                </div>`,
      classic: `<div style="text-align:center; padding: 10px 0 14px; border-bottom: 1px solid var(--tb-ink); margin-bottom: 14px;">
                  <div style="font-family: var(--font-serif); font-size: 26px; letter-spacing: -0.01em;">Invoice</div>
                  <div class="tb-mono" style="color: var(--tb-muted); font-size: 11px;">${this.esc(d.number || "")} · issued ${this.esc(d.issued_on || "")} · due ${this.esc(d.due_on || "")}</div>
                </div>`,
      modern:  `<div style="display:flex; justify-content:space-between; align-items:center; background: var(--tb-ink); color: #fff; padding: 12px 14px; border-radius: 8px; margin-bottom: 14px;">
                  <div style="font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;">Invoice</div>
                  <div class="tb-mono" style="opacity: 0.8; font-size: 11px;">${this.esc(d.number || "")}</div>
                </div>`
    }

    return `
      ${headerByTemplate[d.template] || headerByTemplate.plain}
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
        <div>
          <div class="tb-eyebrow">From</div>
          <div style="font-weight:600;">${this.esc(d.from_name || "—")}</div>
          <div style="color: var(--tb-muted); white-space: pre-line;">${this.esc(d.from_address || "")}</div>
          <div class="tb-mono" style="color: var(--tb-muted); font-size: 11px;">${this.esc(d.from_email || "")}</div>
        </div>
        <div>
          <div class="tb-eyebrow">Bill to</div>
          <div style="font-weight:600;">${this.esc(d.to_name || "—")}</div>
          <div style="color: var(--tb-muted); white-space: pre-line;">${this.esc(d.to_address || "")}</div>
          <div class="tb-mono" style="color: var(--tb-muted); font-size: 11px;">${this.esc(d.to_email || "")}</div>
        </div>
      </div>
      <table style="width:100%; border-collapse: collapse; font-size: 12px;">
        <thead>
          <tr style="border-bottom: 1px solid var(--tb-line);">
            <th style="text-align:left; padding: 6px 0; font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--tb-muted);">Description</th>
            <th style="text-align:right; padding: 6px 0; font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--tb-muted);">Qty</th>
            <th style="text-align:right; padding: 6px 0; font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--tb-muted);">Rate</th>
            <th style="text-align:right; padding: 6px 0; font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--tb-muted);">Amount</th>
          </tr>
        </thead>
        <tbody>${items}</tbody>
      </table>
      <div style="margin-top: 10px; display: flex; justify-content: flex-end;">
        <div style="width: 220px;">
          <div style="display:flex; justify-content:space-between; padding: 3px 0;" class="tb-mono"><span style="color: var(--tb-muted);">Subtotal</span><span>${this.fmt(this.subtotal())}</span></div>
          <div style="display:flex; justify-content:space-between; padding: 3px 0;" class="tb-mono"><span style="color: var(--tb-muted);">Tax ${this.data.tax_rate || 0}%</span><span>${this.fmt(this.taxAmount())}</span></div>
          <div style="display:flex; justify-content:space-between; padding: 6px 0; border-top: 1px solid var(--tb-line); font-weight:600;">
            <span>Total</span><span class="tb-mono">${this.fmt(this.total())}</span>
          </div>
        </div>
      </div>
      ${d.notes ? `<div class="tb-mono" style="margin-top: 14px; padding-top: 10px; border-top: 1px dashed var(--tb-line); color: var(--tb-muted); font-size: 11px; white-space: pre-line;">${this.esc(d.notes)}</div>` : ""}
    `
  }

  // ----- PDF ---------------

  async download () {
    const pdf = await PDFDocument.create()
    const renderer = { plain: this.renderPlain, classic: this.renderClassic, modern: this.renderModern }[this.data.template] || this.renderPlain
    await renderer.call(this, pdf)
    const bytes = await pdf.save()
    const blob = new Blob([bytes], { type: "application/pdf" })
    const fileName = `${(this.data.number || "invoice").replace(/\s+/g, "-")}.pdf`
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url; a.download = fileName
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  // ---- shared helpers for pdf drawing ----
  async fonts (pdf) {
    return {
      regular:  await pdf.embedFont(StandardFonts.Helvetica),
      bold:     await pdf.embedFont(StandardFonts.HelveticaBold),
      mono:     await pdf.embedFont(StandardFonts.Courier),
      boldMono: await pdf.embedFont(StandardFonts.CourierBold),
      serif:    await pdf.embedFont(StandardFonts.TimesRoman),
      serifB:   await pdf.embedFont(StandardFonts.TimesRomanBold)
    }
  }

  asText (s) { return (s || "").toString() }

  drawTable (page, fonts, top, left, width, items, opts) {
    const { regular, bold, mono } = fonts
    const ink = opts.ink || rgb(0.09, 0.09, 0.09)
    const muted = rgb(0.45, 0.45, 0.45)
    const line = rgb(0.88, 0.88, 0.86)
    const colW = { desc: width - 200, qty: 50, rate: 70, amt: 80 }
    let y = top

    // header
    page.drawText("DESCRIPTION", { x: left, y, size: 8, font: mono, color: muted })
    page.drawText("QTY",         { x: left + colW.desc + 20, y, size: 8, font: mono, color: muted })
    page.drawText("RATE",        { x: left + colW.desc + colW.qty + 40, y, size: 8, font: mono, color: muted })
    page.drawText("AMOUNT",      { x: left + colW.desc + colW.qty + colW.rate + 50, y, size: 8, font: mono, color: muted })
    y -= 10
    page.drawLine({ start: { x: left, y }, end: { x: left + width, y }, thickness: 0.6, color: line })
    y -= 14

    for (const it of items) {
      const amount = (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0)
      page.drawText(this.truncate(this.asText(it.description) || "—", 52),
        { x: left, y, size: 10, font: regular, color: ink })
      this.drawRight(page, this.asText(it.quantity), { x: left + colW.desc + 60, y, size: 10, font: mono, color: ink })
      this.drawRight(page, this.fmt(it.unit_price), { x: left + colW.desc + colW.qty + 110, y, size: 10, font: mono, color: ink })
      this.drawRight(page, this.fmt(amount),        { x: left + width, y, size: 10, font: mono, color: ink })
      y -= 16
    }
    return y
  }

  drawRight (page, text, opts) {
    const w = opts.font.widthOfTextAtSize(text, opts.size)
    page.drawText(text, { ...opts, x: opts.x - w })
  }

  truncate (s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s }

  // ----- TEMPLATE: Plain -----
  async renderPlain (pdf) {
    const page = pdf.addPage([595, 842]) // A4
    const f = await this.fonts(pdf)
    const ink = rgb(0.09, 0.09, 0.09)
    const muted = rgb(0.45, 0.45, 0.45)
    const d = this.data

    page.drawText("Invoice", { x: 40, y: 790, size: 28, font: f.bold, color: ink })
    page.drawText(`${this.asText(d.number)} · ${this.asText(d.issued_on)}`,
      { x: 40, y: 770, size: 10, font: f.mono, color: muted })
    page.drawLine({ start: { x: 40, y: 760 }, end: { x: 555, y: 760 }, thickness: 1.2, color: ink })

    // From / To
    page.drawText("FROM", { x: 40, y: 735, size: 8, font: f.mono, color: muted })
    this.drawBlock(page, f, 40, 720, [d.from_name, d.from_address, d.from_email])
    page.drawText("BILL TO", { x: 320, y: 735, size: 8, font: f.mono, color: muted })
    this.drawBlock(page, f, 320, 720, [d.to_name, d.to_address, d.to_email])

    // Table
    let y = this.drawTable(page, f, 650, 40, 515, d.line_items, {})
    this.drawTotals(page, f, y - 10)

    if (d.notes) {
      page.drawText(this.truncate(this.asText(d.notes), 120),
        { x: 40, y: 90, size: 9, font: f.mono, color: muted })
    }
  }

  // ----- TEMPLATE: Classic -----
  async renderClassic (pdf) {
    const page = pdf.addPage([595, 842])
    const f = await this.fonts(pdf)
    const ink = rgb(0.09, 0.09, 0.09)
    const muted = rgb(0.45, 0.45, 0.45)
    const d = this.data

    // centred serif title
    const title = "Invoice"
    const tw = f.serifB.widthOfTextAtSize(title, 32)
    page.drawText(title, { x: (595 - tw) / 2, y: 790, size: 32, font: f.serifB, color: ink })
    const sub = `${this.asText(d.number)} · issued ${this.asText(d.issued_on)} · due ${this.asText(d.due_on)}`
    const sw  = f.mono.widthOfTextAtSize(sub, 9)
    page.drawText(sub, { x: (595 - sw) / 2, y: 770, size: 9, font: f.mono, color: muted })
    page.drawLine({ start: { x: 40, y: 758 }, end: { x: 555, y: 758 }, thickness: 0.8, color: ink })

    page.drawText("FROM",    { x: 40,  y: 732, size: 8, font: f.mono, color: muted })
    this.drawBlock(page, f, 40,  717, [d.from_name, d.from_address, d.from_email])
    page.drawText("BILL TO", { x: 320, y: 732, size: 8, font: f.mono, color: muted })
    this.drawBlock(page, f, 320, 717, [d.to_name, d.to_address, d.to_email])

    let y = this.drawTable(page, f, 640, 40, 515, d.line_items, {})
    this.drawTotals(page, f, y - 10)

    if (d.notes) {
      page.drawText("NOTE", { x: 40, y: 96, size: 8, font: f.mono, color: muted })
      page.drawText(this.truncate(this.asText(d.notes), 120),
        { x: 40, y: 80, size: 10, font: f.serif, color: ink })
    }
  }

  // ----- TEMPLATE: Modern -----
  async renderModern (pdf) {
    const page = pdf.addPage([595, 842])
    const f = await this.fonts(pdf)
    const ink = rgb(0.09, 0.09, 0.09)
    const red = rgb(0.863, 0.15, 0.11)
    const muted = rgb(0.45, 0.45, 0.45)
    const white = rgb(1, 1, 1)
    const d = this.data

    // red hero band
    page.drawRectangle({ x: 0, y: 770, width: 595, height: 60, color: red })
    page.drawText("INVOICE", { x: 40, y: 795, size: 22, font: f.bold, color: white })
    page.drawText(this.asText(d.number), { x: 40, y: 778, size: 10, font: f.mono, color: white })
    const due = `due ${this.asText(d.due_on)}`
    const dw  = f.mono.widthOfTextAtSize(due, 10)
    page.drawText(due, { x: 555 - dw, y: 778, size: 10, font: f.mono, color: white })

    // from / to
    page.drawText("FROM",    { x: 40,  y: 732, size: 8, font: f.mono, color: muted })
    this.drawBlock(page, f, 40,  717, [d.from_name, d.from_address, d.from_email])
    page.drawText("BILL TO", { x: 320, y: 732, size: 8, font: f.mono, color: muted })
    this.drawBlock(page, f, 320, 717, [d.to_name, d.to_address, d.to_email])

    let y = this.drawTable(page, f, 640, 40, 515, d.line_items, {})
    this.drawTotals(page, f, y - 10, { accent: red })

    // thin footer rule in red
    page.drawLine({ start: { x: 40, y: 70 }, end: { x: 555, y: 70 }, thickness: 0.8, color: red })
    if (d.notes) {
      page.drawText(this.truncate(this.asText(d.notes), 120),
        { x: 40, y: 54, size: 9, font: f.mono, color: muted })
    }
  }

  drawBlock (page, f, x, y, lines) {
    const ink = rgb(0.09, 0.09, 0.09)
    const muted = rgb(0.45, 0.45, 0.45)
    let yy = y
    lines.forEach((l, i) => {
      if (!l) return
      const parts = String(l).split("\n")
      parts.forEach((p) => {
        page.drawText(p.slice(0, 60), { x, y: yy, size: i === 0 ? 11 : 10, font: i === 0 ? f.bold : f.regular, color: i === 0 ? ink : muted })
        yy -= 13
      })
    })
  }

  drawTotals (page, f, top, opts = {}) {
    const ink   = rgb(0.09, 0.09, 0.09)
    const muted = rgb(0.45, 0.45, 0.45)
    const line  = rgb(0.88, 0.88, 0.86)
    const x = 360
    const width = 195
    let y = top

    const rows = [
      ["Subtotal", this.fmt(this.subtotal())],
      [`Tax ${this.data.tax_rate || 0}%`, this.fmt(this.taxAmount())]
    ]
    rows.forEach(([k, v]) => {
      page.drawText(k, { x, y, size: 10, font: f.regular, color: muted })
      this.drawRight(page, v, { x: x + width, y, size: 10, font: f.mono, color: ink })
      y -= 15
    })
    y -= 4
    page.drawLine({ start: { x, y }, end: { x: x + width, y }, thickness: 0.6, color: line })
    y -= 16
    page.drawText("Total", { x, y, size: 12, font: f.bold, color: opts.accent || ink })
    this.drawRight(page, this.fmt(this.total()), { x: x + width, y, size: 12, font: f.boldMono, color: opts.accent || ink })
  }

  // ----- save ---------------

  async save () {
    if (!this.signedInValue) { window.location.href = "/login"; return }
    const body = new FormData()
    body.append("invoice[number]",       this.data.number || "")
    body.append("invoice[template]",     this.data.template)
    body.append("invoice[currency]",     this.data.currency)
    body.append("invoice[issued_on]",    this.data.issued_on || "")
    body.append("invoice[due_on]",       this.data.due_on || "")
    body.append("invoice[from_name]",    this.data.from_name || "")
    body.append("invoice[from_address]", this.data.from_address || "")
    body.append("invoice[from_email]",   this.data.from_email || "")
    body.append("invoice[to_name]",      this.data.to_name || "")
    body.append("invoice[to_address]",   this.data.to_address || "")
    body.append("invoice[to_email]",     this.data.to_email || "")
    body.append("invoice[notes]",        this.data.notes || "")
    body.append("invoice[tax_rate]",     this.data.tax_rate || 0)
    body.append("invoice[total_cents]",  this.total().toFixed(2))
    this.data.line_items.forEach((it) => {
      body.append("invoice[line_items][][description]", it.description || "")
      body.append("invoice[line_items][][quantity]",    it.quantity    || 0)
      body.append("invoice[line_items][][unit_price]",  it.unit_price  || 0)
    })

    const url = this.savedValue ? `/invoices/${this.slugValue}` : "/invoices"
    const method = this.savedValue ? "PATCH" : "POST"
    const res = await fetch(url, {
      method, headers: { "X-CSRF-Token": this.csrf(), Accept: "application/json" }, body
    })
    if (res.ok) {
      window.location.href = "/dashboard"
    } else {
      const msg = await res.text()
      this.toast("Couldn't save: " + msg.slice(0, 120))
    }
  }

  // ----- util -----

  esc (s) { return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])) }
  today ()    { return new Date().toISOString().slice(0, 10) }
  in14Days () { const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().slice(0, 10) }
  csrf ()     { const el = document.querySelector('meta[name="csrf-token"]'); return el ? el.content : "" }

  toast (msg) {
    const t = document.createElement("div")
    t.className = "tb-toast"; t.textContent = msg
    document.body.appendChild(t); setTimeout(() => t.remove(), 2800)
  }
}
