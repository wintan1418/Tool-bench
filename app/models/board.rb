class Board < ApplicationRecord
  belongs_to :user, optional: true
  has_many :checks, dependent: :delete_all

  before_validation :assign_slug,         on: :create
  before_validation :assign_manage_token, on: :create

  validates :slug,  presence: true, uniqueness: true
  validates :hosts, presence: true
  validate  :hosts_nonempty

  SLUG_ALPHA = "abcdefghjkmnpqrstuvwxyz23456789".chars.freeze

  # ----- class helpers -----

  def self.normalize_hosts(raw)
    raw.to_s
       .split(/[\s,;\n]+/)
       .map  { |h| sanitize_host(h) }
       .reject(&:blank?)
       .uniq
       .first(25)
  end

  def self.sanitize_host(str)
    s = str.strip.downcase
    return nil if s.empty?
    s = s.sub(%r{^https?://}, "")
    s = s.sub(%r{/.*$}, "")
    s = s.sub(/^www\./, "")
    s.presence
  end

  def self.suggest_name(hosts)
    case hosts.size
    when 0 then "New board"
    when 1 then hosts.first
    else        "#{hosts.first} +#{hosts.size - 1}"
    end
  end

  # ----- instance helpers -----

  def cookie_key
    "bt_#{slug}"
  end

  # Latest check for every host, keyed by host. Uses a single grouped query.
  def latest_checks
    latest_ids = checks.group(:host).maximum(:id).values
    result = checks.where(id: latest_ids).index_by(&:host)
    hosts.each_with_object({}) { |h, acc| acc[h] = result[h] }
  end

  # 24-bucket sparkline per host — 24 most-recent outcomes, oldest first.
  def sparklines
    data = {}
    hosts.each do |host|
      outcomes = checks.where(host: host).order(checked_at: :desc).limit(24).pluck(:status)
      data[host] = outcomes.reverse
    end
    data
  end

  def counts
    latest = latest_checks.values.compact
    {
      up:   latest.count { |c| c.status == "up" },
      slow: latest.count { |c| c.status == "slow" },
      down: latest.count { |c| c.status == "down" }
    }
  end

  def last_checked_at
    checks.maximum(:checked_at)
  end

  private

  def assign_slug
    return if slug.present?
    loop do
      candidate = Array.new(5) { SLUG_ALPHA.sample }.join
      break self.slug = candidate unless self.class.exists?(slug: candidate)
    end
  end

  def assign_manage_token
    self.manage_token ||= SecureRandom.hex(16)
  end

  def hosts_nonempty
    errors.add(:hosts, "can't be empty") if hosts.blank? || hosts.reject(&:blank?).empty?
  end
end
