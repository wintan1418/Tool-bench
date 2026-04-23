class BoardsController < ApplicationController
  allow_unauthenticated_access
  before_action { set_nav :down }
  before_action :find_board, only: [:show, :recheck]

  # POST /down/b — create a board (from the Down landing page form).
  def create
    hosts = Board.normalize_hosts(board_params[:hosts].to_s)
    if hosts.empty?
      flash[:alert] = "Paste at least one URL."
      redirect_to down_path and return
    end

    board = Board.create!(name: board_params[:name].presence || Board.suggest_name(hosts), hosts: hosts, user: current_user)
    cookies.permanent[board.cookie_key] = board.manage_token
    CheckBoardJob.perform_later(board.id)

    redirect_to board_path(slug: board.slug)
  end

  # GET /down/b/:slug
  def show
    page_title "#{@board.name} — Is It Down? · Toolbench"
    meta_description "Live uptime board for #{@board.hosts.take(3).join(', ')}. Shareable. No account required."
    @checks = @board.latest_checks
    @sparklines = @board.sparklines
    @can_manage = cookies[@board.cookie_key] == @board.manage_token

    respond_to do |format|
      format.html
      format.json do
        render json: {
          tableHtml: render_to_string(partial: "boards/table", formats: [:html],
                                       locals: { board: @board, checks: @checks, sparklines: @sparklines }),
          counts: @board.counts,
          lastCheckedRel: (@board.last_checked_at ? "#{time_ago_in_words(@board.last_checked_at)} ago" : "pending")
        }
      end
    end
  end

  # POST /down/b/:slug/recheck
  def recheck
    CheckBoardJob.perform_later(@board.id)
    head :accepted
  end

  private

  def board_params
    params.permit(:name, :hosts)
  end

  def find_board
    @board = Board.find_by!(slug: params[:slug])
  end
end
