class UrlSet < ApplicationRecord
  belongs_to :user, optional: true

  before_validation :assign_slug,         on: :create
  before_validation :assign_manage_token, on: :create

  validates :slug, presence: true, uniqueness: true
  validates :urls, presence: true
  validate  :urls_nonempty
  validate  :urls_all_safe

  MAX_URLS = 50
  SLUG_WORDS = %w[
    mon tue wed thu fri sat sun
    am pm dawn dusk noon
    alpha bravo delta echo foxtrot golf hotel
    pine oak elm maple birch cedar
    amber ruby coral slate ochre
  ].freeze

  # ----- class helpers -----

  def self.normalize_urls(raw)
    lines = raw.to_s.split(/\r?\n/)
    candidates = []
    lines.each do |line|
      l = line.strip
      next if l.empty? || l.start_with?("#")
      # markdown link [label](url)
      if (m = l.match(/\[[^\]]*\]\(([^)]+)\)/))
        candidates << m[1]
        next
      end
      # bullet list
      l = l.sub(/^[\-\*•]\s+/, "")
      # comma / space separated — grab every URL-like token
      l.split(/[\s,]+/).each do |token|
        next if token.empty?
        candidates << token
      end
    end

    candidates
      .map  { |u| normalize_single(u) }
      .reject(&:blank?)
      .uniq
      .first(MAX_URLS)
  end

  def self.normalize_single(url)
    s = url.strip
    return nil if s.empty?
    # hard-block obvious XSS vectors
    return nil if s.match?(/\A(javascript|data|vbscript|file):/i)
    s = "https://#{s}" unless s.match?(%r{\Ahttps?://}i)
    begin
      URI.parse(s)
    rescue URI::InvalidURIError
      return nil
    end
    s
  end

  def self.suggest_name
    "#{SLUG_WORDS.sample}-#{SLUG_WORDS.sample}"
  end

  # ----- instance helpers -----

  def cookie_key
    "us_#{slug}"
  end

  private

  def assign_slug
    return if slug.present?
    5.times do
      candidate = "#{SLUG_WORDS.sample}-#{SLUG_WORDS.sample}"
      unless self.class.exists?(slug: candidate)
        self.slug = candidate
        return
      end
    end
    # fallback — random
    self.slug = SecureRandom.alphanumeric(6).downcase
  end

  def assign_manage_token
    self.manage_token ||= SecureRandom.hex(16)
  end

  def urls_nonempty
    errors.add(:urls, "can't be empty") if urls.blank? || urls.reject(&:blank?).empty?
  end

  def urls_all_safe
    return if urls.blank?
    bad = urls.any? { |u| u.match?(/\A(javascript|data|vbscript|file):/i) }
    errors.add(:urls, "contain unsupported schemes") if bad
  end
end
