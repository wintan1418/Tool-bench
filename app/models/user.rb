class User < ApplicationRecord
  has_secure_password

  has_many :sessions,   dependent: :destroy
  has_many :boards,     dependent: :nullify
  has_many :url_sets,   dependent: :nullify
  has_many :invoices,   dependent: :destroy

  normalizes :email_address, with: ->(e) { e.strip.downcase }

  validates :email_address, presence: true, uniqueness: { case_sensitive: false },
                             format: { with: URI::MailTo::EMAIL_REGEXP, message: "is not a valid email" }
  validates :password, length: { minimum: 8, maximum: 72 }, if: -> { password.present? }
end
