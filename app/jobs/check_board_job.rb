require "net/http"
require "uri"

class CheckBoardJob < ApplicationJob
  queue_as :default

  TIMEOUT  = 6
  REGION   = "us-east"
  CACHE_TTL = 10.seconds

  def perform(board_id)
    board = Board.find_by(id: board_id)
    return unless board

    now = Time.current
    board.hosts.each do |host|
      cached = Rails.cache.read(cache_key(host))
      payload = cached || probe(host)
      Rails.cache.write(cache_key(host), payload, expires_in: CACHE_TTL)

      Check.create!(
        board_id:   board.id,
        host:       host,
        http_code:  payload[:http_code],
        latency_ms: payload[:latency_ms],
        region:     REGION,
        status:     Check.classify(
          http_code:  payload[:http_code],
          latency_ms: payload[:latency_ms],
          reachable:  payload[:reachable]
        ),
        checked_at: now
      )
    end

    # Trim old rows to keep the table small (7-day retention).
    Check.where("checked_at < ?", 7.days.ago).delete_all if rand(10).zero?
  end

  private

  def cache_key(host) = "check:#{host}"

  def probe(host)
    url = "https://#{host}"
    started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    uri = URI.parse(url)
    http = Net::HTTP.new(uri.host, uri.port || 443)
    http.use_ssl = true
    http.open_timeout = TIMEOUT
    http.read_timeout = TIMEOUT
    response = http.request_head(uri.request_uri.presence || "/")
    elapsed = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000).to_i

    { http_code: response.code.to_i, latency_ms: elapsed, reachable: true }
  rescue => _e
    elapsed = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000).to_i if started
    { http_code: nil, latency_ms: elapsed, reachable: false }
  end
end
