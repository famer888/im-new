use tauri::State;

use crate::crypto::CryptoEngine;
use crate::db::DbManager;

/// 与 im「消息解密失败 → 修复」一致：清空内存中的会话密钥缓存，后续收发会重新拉取
#[tauri::command]
pub fn repair_clear_crypto_keys(crypto: State<CryptoEngine>) -> Result<(), String> {
    crypto.clear_all();
    Ok(())
}

/// 清空密钥并删除当前用户本地 SQLite（需重新登录并同步数据）
#[tauri::command]
pub fn repair_reset_user_local_data(
    db: State<'_, DbManager>,
    crypto: State<'_, CryptoEngine>,
    uid: String,
) -> Result<(), String> {
    crypto.clear_all();
    db.delete_user_database(&uid).map_err(|e| e.to_string())
}
