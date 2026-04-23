class AddUserToBoardsAndUrlSets < ActiveRecord::Migration[8.1]
  def change
    add_reference :boards,   :user, foreign_key: true, null: true
    add_reference :url_sets, :user, foreign_key: true, null: true
  end
end
