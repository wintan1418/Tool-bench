Rails.application.routes.draw do
  resource  :session
  resource  :registration, only: [:new, :create], as: :registration
  resources :passwords, param: :token

  get  "signup",  to: "registrations#new"
  get  "login",   to: "sessions#new"
  post "logout",  to: "sessions#destroy"

  get "dashboard", to: "dashboards#show", as: :dashboard

  # Tool 06 — Invoice maker
  get  "invoice",             to: "invoices#new",    as: :new_invoice
  resources :invoices, only: [:create, :update, :destroy], param: :slug
  get  "invoices/:slug/edit", to: "invoices#edit",   as: :edit_invoice

  # Tool 07 — Sign PDF
  get  "sign",                to: "signatures#new",  as: :sign

  # Tools 08 / 09 — Media (client-side ffmpeg.wasm)
  get  "media",               to: redirect("/media/mp4-to-mp3"), as: :media_root
  get  "media/:op",           to: "pages#media",
                              as: :media,
                              constraints: { op: /mp4-to-mp3|webm-to-mp4/ }

  root "pages#home"

  # Static pages
  get "about",     to: "pages#about",     as: :about
  get "privacy",   to: "pages#privacy",   as: :privacy
  get "changelog", to: "pages#changelog", as: :changelog

  # Tool 01 — HEIC → JPG (client-side)
  get "heic-to-jpg", to: "pages#heic", as: :heic

  # Tool 02 — PDF (client-side, multiple ops)
  get "pdf",        to: redirect("/pdf/merge"), as: :pdf_root
  get "pdf/:op",    to: "pages#pdf",
                    as: :pdf,
                    constraints: { op: /merge|split|rotate|compress/ }

  # Tool 05 — Image tools (client-side)
  get "images",        to: redirect("/images/compress"), as: :images_root
  get "images/:op",    to: "pages#image",
                       as: :image,
                       constraints: { op: /compress/ }

  # Tool 03 — Is It Down? (server-side, boards)
  get  "down",              to: "down#index",   as: :down
  post "down/check",        to: "down#check",   as: :down_check
  resources :boards, only: [:create, :show], path: "down/b", param: :slug do
    member do
      post :recheck
    end
  end

  # Tool 04 — Bulk URL opener (server-side sets)
  get  "open",              to: "url_sets#new",    as: :open_urls
  resources :url_sets, only: [:create], path: "o"
  get  "o/:slug",           to: "url_sets#show",   as: :url_set

  # Health / PWA
  get "up" => "rails/health#show", as: :rails_health_check
end
