use rusqlite::{Connection, OptionalExtension, Row, params};

use super::required;
use crate::error::{AppError, AppResult, unique_or, validation};
use crate::models::{Bucket, Category, CategoryInput};

pub const PALETTE: &[&str] =
    &["blue", "purple", "violet", "green", "teal", "amber", "rose", "pink", "lime", "terracotta"];

fn valid_color(c: &str) -> bool {
    PALETTE.contains(&c)
        || (c.len() == 7 && c.starts_with('#') && c[1..].chars().all(|ch| ch.is_ascii_hexdigit()))
}

const SELECT: &str = "
    SELECT c.id, c.name, c.bucket, c.color,
           (SELECT COUNT(*) FROM expenses e WHERE e.category_id = c.id)
         + (SELECT COUNT(*) FROM subscriptions s WHERE s.category_id = c.id)
    FROM categories c";

fn row(r: &Row) -> rusqlite::Result<Category> {
    Ok(Category { id: r.get(0)?, name: r.get(1)?, bucket: r.get(2)?, color: r.get(3)?, entry_count: r.get(4)? })
}

pub fn list(conn: &Connection) -> AppResult<Vec<Category>> {
    let mut stmt = conn.prepare(&format!("{SELECT} ORDER BY c.position, c.id"))?;
    let rows = stmt.query_map([], row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn get(conn: &Connection, id: i64) -> AppResult<Category> {
    conn.query_row(&format!("{SELECT} WHERE c.id = ?1"), [id], row)
        .optional()?
        .ok_or_else(|| AppError::Validation("Choose a category.".into()))
}

fn validate(input: &CategoryInput) -> AppResult<String> {
    let name = required(&input.name, "Category name", 40)?;
    if !valid_color(input.color.trim()) {
        return validation("Pick a colour from the palette or enter a hex code like #4F46E5.");
    }
    Ok(name)
}

pub fn create(conn: &Connection, input: &CategoryInput) -> AppResult<Category> {
    let name = validate(input)?;
    conn.execute(
        "INSERT INTO categories (name, bucket, color, position)
         VALUES (?1, ?2, ?3, (SELECT COALESCE(MAX(position), 0) + 1 FROM categories))",
        params![name, input.bucket, input.color.trim().to_lowercase()],
    )
    .map_err(|e| unique_or(e, "A category with this name already exists."))?;
    get(conn, conn.last_insert_rowid())
}

/// Rename, move bucket or recolour (CAT-04). Moving bucket also moves the
/// bucket of every existing expense and subscription in the category.
pub fn update(conn: &mut Connection, id: i64, input: &CategoryInput) -> AppResult<Category> {
    let name = validate(input)?;
    let before = get(conn, id)?;
    let tx = conn.transaction()?;
    tx.execute(
        "UPDATE categories SET name = ?1, bucket = ?2, color = ?3 WHERE id = ?4",
        params![name, input.bucket, input.color.trim().to_lowercase(), id],
    )
    .map_err(|e| unique_or(e, "A category with this name already exists."))?;
    if before.bucket != input.bucket {
        tx.execute("UPDATE expenses SET bucket = ?1 WHERE category_id = ?2", params![input.bucket, id])?;
        tx.execute("UPDATE subscriptions SET bucket = ?1 WHERE category_id = ?2", params![input.bucket, id])?;
    }
    tx.commit()?;
    get(conn, id)
}

/// Delete a category, moving its entries to `replacement` (CAT-05).
pub fn delete(conn: &mut Connection, id: i64, replacement: Option<i64>) -> AppResult<()> {
    let cat = get(conn, id)?;
    let tx = conn.transaction()?;
    if cat.entry_count > 0 {
        let Some(to) = replacement else {
            return validation("Choose a category to move existing entries to.");
        };
        if to == id {
            return validation("Choose a different category.");
        }
        let target = get(&tx, to)?;
        let bucket: Bucket = target.bucket;
        tx.execute(
            "UPDATE expenses SET category_id = ?1, bucket = ?2 WHERE category_id = ?3",
            params![to, bucket, id],
        )?;
        tx.execute(
            "UPDATE subscriptions SET category_id = ?1, bucket = ?2 WHERE category_id = ?3",
            params![to, bucket, id],
        )?;
    }
    tx.execute("DELETE FROM categories WHERE id = ?1", [id])?;
    tx.commit()?;
    Ok(())
}
