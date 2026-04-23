class PagesController < ApplicationController
  allow_unauthenticated_access

  def home
    set_nav :home
    page_title "Toolbench — four everyday web utilities, no uploads"
    meta_description "HEIC to JPG, PDF merge/split, website uptime, and bulk URL opener. HEIC and PDF tools run entirely in your browser. No accounts, no tracking."
  end

  def heic
    set_nav :heic
    page_title "HEIC to JPG converter — runs in your browser · Toolbench"
    meta_description "Convert HEIC photos to JPG, PNG or WebP. Works entirely in your browser — no upload, no account, unlimited files."
  end

  def pdf
    @op = params[:op]
    set_nav :pdf
    titles = {
      "merge"    => ["Merge PDF", "Combine multiple PDFs into one, in your browser. No upload."],
      "split"    => ["Split PDF", "Split a PDF into separate pages. Runs on your device only."],
      "rotate"   => ["Rotate PDF", "Rotate PDF pages without uploading the file."],
      "compress" => ["Compress PDF", "Shrink a PDF in your browser. No upload, no account."]
    }
    t, d = titles[@op]
    page_title "#{t} — runs in your browser · Toolbench"
    meta_description d
  end

  def media
    @op = params[:op]
    set_nav :media
    titles = {
      "mp4-to-mp3"  => ["MP4 to MP3",  "Extract audio from MP4 video as MP3, in your browser. No upload."],
      "webm-to-mp4" => ["WebM to MP4", "Convert WebM video to MP4, in your browser. No upload."]
    }
    t, d = titles[@op]
    page_title "#{t} — runs in your browser · Toolbench"
    meta_description d
  end

  def image
    @op = params[:op]
    set_nav :images
    titles = {
      "compress" => ["Compress images", "Shrink JPG, PNG and WebP images in your browser. No upload, no account."]
    }
    t, d = titles[@op]
    page_title "#{t} — runs in your browser · Toolbench"
    meta_description d
  end

  def about
    set_nav :about
    page_title "About — Toolbench"
  end

  def privacy
    page_title "Privacy — Toolbench"
  end

  def changelog
    page_title "Changelog — Toolbench"
  end
end
