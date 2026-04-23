class CreateInvoices < ActiveRecord::Migration[8.1]
  def change
    create_table :invoices do |t|
      t.references :user,         foreign_key: true, null: false
      t.string     :slug,         null: false
      t.string     :number,       null: false
      t.string     :template,     null: false, default: "plain"  # plain | classic | modern
      t.string     :currency,     null: false, default: "USD"
      t.date       :issued_on
      t.date       :due_on
      t.string     :from_name
      t.text       :from_address
      t.string     :from_email
      t.string     :to_name
      t.text       :to_address
      t.string     :to_email
      t.text       :notes
      t.jsonb      :line_items,   null: false, default: []
      t.decimal    :tax_rate,     precision: 6, scale: 3, default: 0
      t.decimal    :total_cents,  precision: 14, scale: 2, default: 0
      t.timestamps
    end

    add_index :invoices, :slug,               unique: true
    add_index :invoices, [:user_id, :created_at]
  end
end
