class Invoice < ApplicationRecord
  belongs_to :user

  TEMPLATES = %w[plain classic modern].freeze

  before_validation :assign_slug,   on: :create
  before_validation :assign_number, on: :create

  validates :slug,     presence: true, uniqueness: true
  validates :number,   presence: true
  validates :template, inclusion: { in: TEMPLATES }
  validates :currency, presence: true

  scope :recent, -> { order(created_at: :desc) }

  def self.suggest_number(user)
    count = user ? user.invoices.count : 0
    "INV-#{1001 + count}"
  end

  def display_total
    total_cents.to_f
  end

  private

  def assign_slug
    return if slug.present?
    loop do
      candidate = SecureRandom.alphanumeric(7).downcase
      break self.slug = candidate unless self.class.exists?(slug: candidate)
    end
  end

  def assign_number
    self.number ||= self.class.suggest_number(user)
  end
end
