use tauri::State;
use serde_json::Value as JsonValue;
use crate::crypto;
use crate::db::{self, DbState};
use crate::models::{CreateAccountInput, CreatePostInput};

/// Tauri Command: Create a new account
/// Invariant: Plain token is encrypted via AES-256-GCM before writing to SQLite.
/// Output is masked with `#[serde(skip_serializing)]` on the encrypted token field.
#[tauri::command]
pub async fn create_account(
    state: State<'_, DbState>,
    input: CreateAccountInput,
) -> Result<JsonValue, String> {
    // 1. Obtain master key from OS Keyring
    let key = crypto::get_or_generate_key().map_err(|e| e.to_string())?;

    // 2. Encrypt the raw token with a unique 12-byte Nonce
    let encrypted = crypto::encrypt_token(&input.encrypted_token, &key).map_err(|e| e.to_string())?;

    // 3. Prepare payload for DB insertion
    let mut db_input = input;
    db_input.encrypted_token = encrypted;

    // 4. Save to database
    let account = db::create_account(&state.pool, db_input).await?;

    // 5. Mask token for frontend response
    let safe_account = account.with_masked_token();

    serde_json::to_value(&safe_account).map_err(|e| format!("Serialization error: {}", e))
}

/// Tauri Command: Retrieve all accounts
/// Invariant: Frontend isolation: Real token is excluded from serialization (`#[serde(skip_serializing)]`)
/// and a safe mask is provided.
#[tauri::command]
pub async fn get_accounts(state: State<'_, DbState>) -> Result<JsonValue, String> {
    let accounts = db::get_accounts(&state.pool).await?;
    let safe_accounts: Vec<_> = accounts
        .into_iter()
        .map(|acc| acc.with_masked_token())
        .collect();

    serde_json::to_value(&safe_accounts).map_err(|e| format!("Serialization error: {}", e))
}

/// Tauri Command: Retrieve an account by its UUID
/// Invariant: Frontend isolation: Token is never sent to frontend.
#[tauri::command]
pub async fn get_account_by_id(
    state: State<'_, DbState>,
    id: String,
) -> Result<JsonValue, String> {
    let maybe_account = db::get_account_by_id(&state.pool, &id).await?;
    let safe_account = maybe_account.map(|acc| acc.with_masked_token());

    serde_json::to_value(&safe_account).map_err(|e| format!("Serialization error: {}", e))
}

/// Tauri Command: Delete an account by UUID
/// Invariant: Cascade deletes associated entries in post_destinations
#[tauri::command]
pub async fn delete_account(
    state: State<'_, DbState>,
    id: String,
) -> Result<JsonValue, String> {
    let deleted = db::delete_account(&state.pool, &id).await?;
    Ok(serde_json::json!({
        "deleted": deleted,
        "id": id
    }))
}

/// Tauri Command: Create a new post
#[tauri::command]
pub async fn create_post(
    state: State<'_, DbState>,
    input: CreatePostInput,
) -> Result<JsonValue, String> {
    let post = db::create_post(&state.pool, input).await?;
    serde_json::to_value(&post).map_err(|e| format!("Serialization error: {}", e))
}

/// Tauri Command: Retrieve all posts
#[tauri::command]
pub async fn get_posts(state: State<'_, DbState>) -> Result<JsonValue, String> {
    let posts = db::get_posts(&state.pool).await?;
    serde_json::to_value(&posts).map_err(|e| format!("Serialization error: {}", e))
}

/// Tauri Command: Delete a post by UUID
#[tauri::command]
pub async fn delete_post(
    state: State<'_, DbState>,
    id: String,
) -> Result<JsonValue, String> {
    let deleted = db::delete_post(&state.pool, &id).await?;
    Ok(serde_json::json!({
        "deleted": deleted,
        "id": id
    }))
}

/// Tauri Command: Retry a failed or partially published post
#[tauri::command]
pub async fn retry_post(
    state: State<'_, DbState>,
    id: String,
) -> Result<JsonValue, String> {
    db::retry_post(&state.pool, &id).await?;
    let maybe_post = db::get_post_by_id(&state.pool, &id).await?;
    let post = maybe_post.ok_or_else(|| format!("Post '{}' not found", id))?;
    serde_json::to_value(&post).map_err(|e| format!("Serialization error: {}", e))
}
