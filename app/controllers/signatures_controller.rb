class SignaturesController < ApplicationController
  allow_unauthenticated_access
  before_action { set_nav :sign }

  def new
    page_title "Sign PDF — runs in your browser · Toolbench"
    meta_description "Add a signature to a PDF right in your browser. Draw or type your signature, drop it on the page, download the signed PDF. Nothing uploads."
  end
end
