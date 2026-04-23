class CreateUrlSets < ActiveRecord::Migration[8.1]
  def change
    create_table :url_sets do |t|
      t.string :slug,         null: false
      t.string :name,         null: false
      t.text   :urls,         array: true, null: false, default: []
      t.string :manage_token, null: false
      t.datetime :last_accessed_at
      t.timestamps
    end

    add_index :url_sets, :slug, unique: true
  end
end
