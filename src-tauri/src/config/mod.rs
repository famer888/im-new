use parking_lot::RwLock;
use std::path::{Path, PathBuf};
use tracing::info;

use crate::commands::settings::AppSettings;

pub struct ConfigManager {
    config_path: PathBuf,
    settings: RwLock<AppSettings>,
}

impl ConfigManager {
    pub fn new(app_data_dir: &Path) -> Result<Self, ConfigError> {
        let config_path = app_data_dir.join("settings.json");

        let settings = if config_path.exists() {
            let data = std::fs::read_to_string(&config_path)
                .map_err(|e| ConfigError::IoError(e.to_string()))?;
            serde_json::from_str(&data).unwrap_or_default()
        } else {
            AppSettings::default()
        };

        info!("Config loaded from {:?}", config_path);

        Ok(Self {
            config_path,
            settings: RwLock::new(settings),
        })
    }

    pub fn get_settings(&self) -> Result<AppSettings, ConfigError> {
        Ok(self.settings.read().clone())
    }

    pub fn save_settings(&self, settings: &AppSettings) -> Result<(), ConfigError> {
        let data = serde_json::to_string_pretty(settings)
            .map_err(|e| ConfigError::SerializeError(e.to_string()))?;

        if let Some(parent) = self.config_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| ConfigError::IoError(e.to_string()))?;
        }

        std::fs::write(&self.config_path, data)
            .map_err(|e| ConfigError::IoError(e.to_string()))?;

        *self.settings.write() = settings.clone();
        info!("Config saved to {:?}", self.config_path);
        Ok(())
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("IO error: {0}")]
    IoError(String),
    #[error("Serialize error: {0}")]
    SerializeError(String),
}

impl serde::Serialize for ConfigError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
