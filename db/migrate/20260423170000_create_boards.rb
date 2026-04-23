class CreateBoards < ActiveRecord::Migration[8.1]
  def change
    create_table :boards do |t|
      t.string  :slug,         null: false
      t.string  :name,         null: false
      t.text    :hosts,        array: true, null: false, default: []
      t.string  :manage_token, null: false
      t.datetime :last_accessed_at
      t.timestamps
    end

    add_index :boards, :slug, unique: true
  end
end
