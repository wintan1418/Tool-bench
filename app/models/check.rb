class Check < ApplicationRecord
  belongs_to :board

  STATUSES = %w[up slow down].freeze
  SLOW_MS = 1500

  validates :host,       presence: true
  validates :status,     inclusion: { in: STATUSES }
  validates :checked_at, presence: true

  scope :recent, -> { order(checked_at: :desc) }

  def self.classify(http_code:, latency_ms:, reachable:)
    return "down" unless reachable
    return "down" if http_code.nil? || http_code >= 500
    return "slow" if latency_ms && latency_ms >= SLOW_MS
    "up"
  end
end
