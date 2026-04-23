class CreateChecks < ActiveRecord::Migration[8.1]
  def change
    create_table :checks do |t|
      t.references :board,      null: false, foreign_key: true
      t.string     :host,       null: false
      t.string     :status,     null: false
      t.integer    :http_code
      t.integer    :latency_ms
      t.string     :region
      t.datetime   :checked_at, null: false
      t.timestamps
    end

    add_index :checks, [:board_id, :host, :checked_at]
    add_index :checks, :checked_at
  end
end
