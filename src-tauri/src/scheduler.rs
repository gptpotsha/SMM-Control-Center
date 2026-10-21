use std::time::Duration;
use sqlx::SqlitePool;
use zeroize::Zeroize;
use crate::crypto;
use crate::db;
use crate::publisher::{PostPublisher, RealPublisher};

pub const DEFAULT_POLL_INTERVAL: Duration = Duration::from_secs(30);

/// Run one iteration of processing all due scheduled posts.
/// Returns the number of successfully published posts.
pub async fn process_due_posts<P: PostPublisher>(
    pool: &SqlitePool,
    publisher: &P,
    key_override: Option<[u8; 32]>,
) -> Result<usize, String> {
    let now = chrono::Utc::now().timestamp();
    let due_posts = db::get_due_posts(pool, now).await?;

    if due_posts.is_empty() {
        return Ok(0);
    }

    println!("[Scheduler] Found {} due post(s) for publishing", due_posts.len());
    let mut published_count = 0;

    for post in due_posts {
        // Invariant: Atomic lock on post.
        // If 0 rows affected, another process or thread already locked it -> skip.
        let locked = db::try_lock_post_for_publishing(pool, &post.id).await?;
        if !locked {
            println!(
                "[Scheduler] Post '{}' was already locked or state changed, skipping",
                post.id
            );
            continue;
        }

        println!("[Scheduler] Post '{}' locked into 'publishing' status", post.id);

        // Edge case: Post must have destination accounts
        if post.destination_account_ids.is_empty() {
            eprintln!(
                "[Scheduler] Post '{}' has no destination accounts, marking as failed",
                post.id
            );
            db::update_post_status(pool, &post.id, "failed").await?;
            continue;
        }

        // Edge case: Access to OS Keyring
        let master_key = match key_override {
            Some(key) => Ok(key),
            None => crypto::get_or_generate_key().map_err(|e| {
                format!("Нет доступа к ключам ОС: {}", e)
            }),
        };

        let master_key = match master_key {
            Ok(k) => k,
            Err(err_msg) => {
                eprintln!(
                    "[Scheduler] Error obtaining master key for post '{}': {}, marking as failed",
                    post.id, err_msg
                );
                db::update_post_status(pool, &post.id, "failed").await?;
                continue;
            }
        };

        // Iterate over destinations: Only process pending or failed destinations.
        // Invariant: Duplicate protection: Re-sending to an already 'published' destination is FORBIDDEN.
        let destinations = db::get_post_destinations(pool, &post.id).await?;

        for dest in destinations {
            if dest.status == "published" {
                println!(
                    "[Scheduler] Account destination '{}' on post '{}' is already 'published', skipping",
                    dest.account_id, post.id
                );
                continue;
            }

            let account = match db::get_account_by_id(pool, &dest.account_id).await? {
                Some(acc) => acc,
                None => {
                    eprintln!(
                        "[Scheduler] Target account '{}' not found for post '{}'",
                        dest.account_id, post.id
                    );
                    db::update_destination_status(
                        pool,
                        &post.id,
                        &dest.account_id,
                        "failed",
                        Some("Account not found in database"),
                    )
                    .await?;
                    continue;
                }
            };

            // Decrypt token
            let mut plain_token = match crypto::decrypt_token(&account.encrypted_token, &master_key) {
                Ok(token) => token,
                Err(e) => {
                    eprintln!(
                        "[Scheduler] Failed to decrypt token for account '{}' on post '{}': {}",
                        account.name, post.id, e
                    );
                    db::update_destination_status(
                        pool,
                        &post.id,
                        &dest.account_id,
                        "failed",
                        Some("Failed to decrypt access token"),
                    )
                    .await?;
                    continue;
                }
            };

            // Publish via connector
            let publish_result = publisher
                .publish(
                    &account.platform,
                    &account.name,
                    &plain_token,
                    &post.content,
                    &post.media_urls,
                )
                .await;

            // Invariant: Secret Redaction 2.0 & Log limit (max 500 characters)
            match publish_result {
                Ok(external_id) => {
                    println!(
                        "[Scheduler] Successfully published post '{}' to account '{}' (id: {})",
                        post.id, account.name, external_id
                    );
                    db::update_destination_status(
                        pool,
                        &post.id,
                        &dest.account_id,
                        "published",
                        None,
                    )
                    .await?;
                }
                Err(raw_error) => {
                    // Replace plain token if accidentally present
                    let sanitized = raw_error.replace(&plain_token, "[REDACTED]");
                    // Truncate to at most 500 characters safely
                    let final_log: String = sanitized.chars().take(500).collect();
                    eprintln!(
                        "[Scheduler] Publishing failed for account '{}' on post '{}': {}",
                        account.name, post.id, final_log
                    );
                    db::update_destination_status(
                        pool,
                        &post.id,
                        &dest.account_id,
                        "failed",
                        Some(&final_log),
                    )
                    .await?;
                }
            }

            // Invariant: Immediately zeroize plain-text token from memory
            plain_token.zeroize();
        }

        // Edge case: Post status aggregation
        // All published -> published; both published and failed -> partially_published; all failed -> failed.
        let all_dests = db::get_post_destinations(pool, &post.id).await?;
        let total = all_dests.len();
        let published_dests = all_dests.iter().filter(|d| d.status == "published").count();
        let failed_dests = all_dests.iter().filter(|d| d.status == "failed").count();

        let final_status = if total == 0 {
            "failed"
        } else if published_dests == total {
            "published"
        } else if failed_dests == total {
            "failed"
        } else if published_dests > 0 {
            "partially_published"
        } else {
            "failed"
        };

        db::update_post_status(pool, &post.id, final_status).await?;
        println!(
            "[Scheduler] Post '{}' status updated to '{}' (published: {}/{}, failed: {})",
            post.id, final_status, published_dests, total, failed_dests
        );

        if final_status == "published" || final_status == "partially_published" {
            published_count += 1;
        }
    }

    Ok(published_count)
}

/// Start the background worker inside Tokio runtime.
/// Invariant: Non-blocking via `tauri::async_runtime::spawn`.
pub fn start_worker(pool: SqlitePool) {
    tauri::async_runtime::spawn(async move {
        let publisher = RealPublisher::new();
        println!(
            "[Scheduler] Background worker started with {:?} polling interval (RealPublisher)",
            DEFAULT_POLL_INTERVAL
        );

        loop {
            if let Err(e) = process_due_posts(&pool, &publisher, None).await {
                eprintln!("[Scheduler] Background worker error: {}", e);
            }
            tokio::time::sleep(DEFAULT_POLL_INTERVAL).await;
        }
    });
}
