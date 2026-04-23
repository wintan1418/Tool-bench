class InvoicesController < ApplicationController
  allow_unauthenticated_access only: [:new]
  before_action :require_auth_for_save, only: [:create, :update, :destroy, :edit]
  before_action { set_nav :invoice }

  # GET /invoice — the builder (works signed out; "Save" is gated).
  def new
    page_title "Invoice maker — free, no upload · Toolbench"
    meta_description "Create invoices in your browser. Pick a template, add line items, download a PDF. Save to your free account if you want a dashboard."
    @invoice = load_invoice
  end

  # POST /invoices — save a new invoice (signed-in users only).
  def create
    invoice = current_user.invoices.new(invoice_params)
    if invoice.save
      respond_to do |format|
        format.html { redirect_to dashboard_path, notice: "Invoice saved." }
        format.json { render json: { slug: invoice.slug, number: invoice.number, url: edit_invoice_url(slug: invoice.slug) } }
      end
    else
      respond_to do |format|
        format.html { redirect_to new_invoice_path, alert: invoice.errors.full_messages.to_sentence }
        format.json { render json: { errors: invoice.errors.full_messages }, status: :unprocessable_entity }
      end
    end
  end

  # GET /invoices/:slug/edit — open a saved invoice in the builder.
  def edit
    @invoice = current_user.invoices.find_by!(slug: params[:slug])
    page_title "#{@invoice.number} · Toolbench"
    render :new
  end

  # PATCH /invoices/:slug — update saved invoice data.
  def update
    @invoice = current_user.invoices.find_by!(slug: params[:slug])
    if @invoice.update(invoice_params)
      respond_to do |format|
        format.html { redirect_to dashboard_path, notice: "Invoice updated." }
        format.json { render json: { slug: @invoice.slug } }
      end
    else
      respond_to do |format|
        format.html { redirect_to edit_invoice_path(slug: @invoice.slug), alert: @invoice.errors.full_messages.to_sentence }
        format.json { render json: { errors: @invoice.errors.full_messages }, status: :unprocessable_entity }
      end
    end
  end

  # DELETE /invoices/:slug
  def destroy
    invoice = current_user.invoices.find_by!(slug: params[:slug])
    invoice.destroy
    redirect_to dashboard_path, notice: "Invoice deleted."
  end

  private

  def invoice_params
    params.require(:invoice).permit(
      :number, :template, :currency, :issued_on, :due_on,
      :from_name, :from_address, :from_email,
      :to_name, :to_address, :to_email,
      :notes, :tax_rate, :total_cents,
      line_items: [:description, :quantity, :unit_price]
    )
  end

  def require_auth_for_save
    return if signed_in?
    if request.format.json?
      render json: { error: "sign_in_required", login_url: new_session_path }, status: :unauthorized
    else
      redirect_to new_session_path, alert: "Sign in to save invoices."
    end
  end

  def load_invoice
    return current_user.invoices.find_by(slug: params[:slug]) if params[:slug] && signed_in?
    Invoice.new(
      template: "plain",
      currency: "USD",
      line_items: [],
      tax_rate: 0,
      number: Invoice.suggest_number(current_user)
    )
  end
end
