class DownController < ApplicationController
  allow_unauthenticated_access
  before_action { set_nav :down }

  # GET /down — landing page. Shows a URL input that posts to #check.
  def index
    page_title "Is It Down? — shareable uptime boards · Toolbench"
    meta_description "Paste any URL, get an instant status check. Save a list of URLs as a shareable board with a permanent link."
  end

  # POST /down/check — quick-check without creating a board.
  # Either renders a one-off result or, if multiple hosts are given, creates a board.
  def check
    hosts = Board.normalize_hosts(params[:hosts].to_s)
    if hosts.empty?
      flash[:alert] = "Paste a URL or a list of URLs."
      redirect_to down_path and return
    end

    board = Board.create!(name: Board.suggest_name(hosts), hosts: hosts, user: current_user)
    cookies.permanent[board.cookie_key] = board.manage_token

    # Kick off one pass immediately for snappy first render.
    CheckBoardJob.perform_later(board.id)

    redirect_to board_path(slug: board.slug)
  end
end
