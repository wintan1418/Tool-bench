class ApplicationController < ActionController::Base
  include Authentication
  # Only allow modern browsers supporting webp images, web push, badges, import maps, CSS nesting, and CSS :has.
  allow_browser versions: :modern

  helper_method :current_nav, :page_title, :meta_description, :current_user, :signed_in?

  private

  def set_nav(key)
    @current_nav = key
  end

  def current_nav
    @current_nav ||= :home
  end

  def page_title(title = nil)
    @page_title = title if title
    @page_title
  end

  def meta_description(desc = nil)
    @meta_description = desc if desc
    @meta_description
  end

  def current_user
    Current.user
  end

  def signed_in?
    Current.user.present?
  end
end
