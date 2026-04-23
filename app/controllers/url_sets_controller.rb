class UrlSetsController < ApplicationController
  allow_unauthenticated_access
  before_action { set_nav :open }

  # GET /open — paste-and-open landing.
  def new
    page_title "Bulk URL opener — paste a list, open all at once · Toolbench"
    meta_description "Paste any list of URLs and open them all in new tabs, or save as a shareable set you can reuse."
  end

  # POST /o — save a set of URLs. Returns the shareable slug.
  def create
    urls = UrlSet.normalize_urls(url_set_params[:urls].to_s)
    if urls.empty?
      respond_to do |format|
        format.html { redirect_to open_urls_path, alert: "Paste at least one URL." }
        format.json { render json: { error: "empty" }, status: :unprocessable_entity }
      end
      return
    end

    set = UrlSet.create!(
      name: url_set_params[:name].presence || UrlSet.suggest_name,
      urls: urls,
      user: current_user
    )
    cookies.permanent[set.cookie_key] = set.manage_token

    respond_to do |format|
      format.html { redirect_to url_set_path(slug: set.slug) }
      format.json { render json: { slug: set.slug, url: url_set_url(slug: set.slug) } }
    end
  end

  # GET /o/:slug — public set with Open All.
  def show
    @set = UrlSet.find_by!(slug: params[:slug])
    page_title "#{@set.name} — tab set · Toolbench"
    meta_description "#{@set.urls.size} links, ready to open in new tabs. Shareable."
    @can_manage = cookies[@set.cookie_key] == @set.manage_token
  end

  private

  def url_set_params
    params.permit(:name, :urls)
  end
end
