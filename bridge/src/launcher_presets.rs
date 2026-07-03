use std::collections::{HashMap, HashSet};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use herdr_compat::api::schema::{LayoutNode, LayoutPane, SplitDirection};
use serde::{Deserialize, Serialize};

pub const LAUNCHER_PRESETS_ENV: &str = "HERDR_WEB_LAUNCHER_PRESETS";
pub const MAX_PRESET_ID_BYTES: usize = 80;
pub const MAX_LABEL_BYTES: usize = 120;

const BUILTIN_SHELL_ID: &str = "builtin:shell";
const BUILTIN_CODEX_ID: &str = "builtin:codex";
const BUILTIN_CLAUDE_ID: &str = "builtin:claude";
const BUILTIN_PI_ID: &str = "builtin:pi";

const KNOWN_AGENT_HINTS: &[&str] = &[
    "amp",
    "amp-local",
    "agy",
    "antigravity",
    "antigravity-cli",
    "claude",
    "claude-code",
    "cline",
    "codex",
    "copilot",
    "cursor",
    "cursor-agent",
    "devin",
    "devin-cli",
    "droid",
    "gemini",
    "github-copilot",
    "ghcs",
    "grok",
    "grok-build",
    "hermes",
    "hermes-agent",
    "kilo",
    "kilo-code",
    "kimi",
    "kimi-code",
    "kiro",
    "kiro-cli",
    "omp",
    "opencode",
    "open-code",
    "pi",
    "qoder",
    "qoderclicn",
    "qodercn",
    "qodercli",
];

#[derive(Debug, Clone)]
pub struct LauncherPresetStore {
    presets: Vec<ResolvedLauncherPreset>,
    warnings: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct ResolvedLauncherPreset {
    pub id: String,
    pub label: String,
    pub agent_hint: Option<String>,
    pub argv: Option<Vec<String>>,
    pub env: HashMap<String, String>,
    pub cwd: Option<String>,
    pub built_in: bool,
}

#[derive(Debug, Serialize)]
pub struct LauncherPresetsResponse {
    pub version: u32,
    pub presets: Vec<LauncherPresetDisplay>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LauncherPresetDisplay {
    pub id: String,
    pub label: String,
    pub agent_hint: Option<String>,
    pub built_in: bool,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct LauncherPresetFile {
    #[serde(default)]
    version: Option<u32>,
    #[serde(default)]
    presets: Vec<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct LauncherPresetConfig {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    label: Option<String>,
    #[serde(default)]
    argv: Option<Vec<String>>,
    #[serde(default)]
    agent_hint: Option<String>,
    #[serde(default)]
    env: HashMap<String, String>,
    #[serde(default)]
    cwd: Option<String>,
}

impl LauncherPresetStore {
    pub fn load(path: Option<PathBuf>) -> Result<Self, String> {
        let env_path = env::var_os(LAUNCHER_PRESETS_ENV).map(PathBuf::from);
        let explicit = path.is_some() || env_path.is_some();
        let path = path
            .or(env_path)
            .unwrap_or_else(default_launcher_presets_path);
        Self::load_from_path_with_mode(&path, explicit)
    }

    #[cfg(test)]
    pub fn load_from_path(path: &Path) -> Result<Self, String> {
        Self::load_from_path_with_mode(path, false)
    }

    fn load_from_path_with_mode(path: &Path, explicit: bool) -> Result<Self, String> {
        let mut presets = builtin_presets();
        let mut warnings = Vec::new();
        if !path.exists() {
            if explicit {
                warnings.push(format!(
                    "launcher presets file not found at {}",
                    path.display()
                ));
            }
            return Ok(Self { presets, warnings });
        }
        let text = match fs::read_to_string(path) {
            Ok(text) => text,
            Err(err) => {
                let message = format!("launcher presets read error at {}: {err}", path.display());
                if explicit {
                    return Err(message);
                }
                warnings.push(message);
                return Ok(Self { presets, warnings });
            }
        };
        let config: LauncherPresetFile = match serde_json::from_str(&text) {
            Ok(config) => config,
            Err(err) => {
                let message = format!("launcher presets parse error at {}: {err}", path.display());
                if explicit {
                    return Err(message);
                }
                warnings.push(message);
                return Ok(Self { presets, warnings });
            }
        };
        if config.version.unwrap_or(1) != 1 {
            let message = format!(
                "launcher presets parse error at {}: unsupported version",
                path.display()
            );
            if explicit {
                return Err(message);
            }
            warnings.push(message);
            return Ok(Self { presets, warnings });
        }
        let mut ids: HashSet<String> = presets.iter().map(|preset| preset.id.clone()).collect();
        for config_preset in config.presets {
            let config_preset = match serde_json::from_value::<LauncherPresetConfig>(config_preset)
            {
                Ok(config_preset) => config_preset,
                Err(err) => {
                    warnings.push(format!("invalid launcher preset entry: {err}"));
                    continue;
                }
            };
            match resolve_config_preset(config_preset, &ids) {
                Ok(preset) => {
                    ids.insert(preset.id.clone());
                    presets.push(preset);
                }
                Err(message) => warnings.push(message),
            }
        }
        Ok(Self { presets, warnings })
    }

    pub fn response(&self) -> LauncherPresetsResponse {
        LauncherPresetsResponse {
            version: 1,
            presets: self
                .presets
                .iter()
                .map(|preset| LauncherPresetDisplay {
                    id: preset.id.clone(),
                    label: preset.label.clone(),
                    agent_hint: preset.agent_hint.clone(),
                    built_in: preset.built_in,
                })
                .collect(),
            warnings: self.warnings.clone(),
        }
    }

    pub fn preset(&self, id: &str) -> Option<&ResolvedLauncherPreset> {
        self.presets.iter().find(|preset| preset.id == id)
    }
}

impl ResolvedLauncherPreset {
    pub fn is_builtin_shell(&self) -> bool {
        self.id == BUILTIN_SHELL_ID
    }

    pub fn launch_env(&self) -> HashMap<String, String> {
        let mut env = self.env.clone();
        if let Some(agent_hint) = &self.agent_hint {
            env.insert("HERDR_AGENT".to_string(), agent_hint.clone());
        }
        env
    }
}

pub fn layout_leaf_for_preset(preset: &ResolvedLauncherPreset, title: &str) -> LayoutNode {
    LayoutNode::Pane {
        pane: LayoutPane {
            pane_id: None,
            label: Some(title.to_string()),
            cwd: preset.cwd.clone(),
            command: preset.argv.clone(),
            env: preset.launch_env(),
        },
    }
}

pub fn split_layout_with_command_preset(
    root: LayoutNode,
    target_pane_id: &str,
    direction: SplitDirection,
    preset: &ResolvedLauncherPreset,
    title: &str,
) -> Result<LayoutNode, ()> {
    let (root, replaced) = replace_layout_leaf(root, target_pane_id, direction, preset, title);
    if replaced {
        Ok(root)
    } else {
        Err(())
    }
}

fn replace_layout_leaf(
    root: LayoutNode,
    target_pane_id: &str,
    new_direction: SplitDirection,
    preset: &ResolvedLauncherPreset,
    title: &str,
) -> (LayoutNode, bool) {
    match root {
        LayoutNode::Pane { pane } => {
            if pane.pane_id.as_deref() == Some(target_pane_id) {
                (
                    LayoutNode::Split {
                        direction: new_direction,
                        ratio: 0.5,
                        first: Box::new(LayoutNode::Pane { pane }),
                        second: Box::new(layout_leaf_for_preset(preset, title)),
                    },
                    true,
                )
            } else {
                (LayoutNode::Pane { pane }, false)
            }
        }
        LayoutNode::Split {
            direction: existing_direction,
            ratio,
            first,
            second,
        } => {
            let (new_first, replaced) =
                replace_layout_leaf(*first, target_pane_id, new_direction.clone(), preset, title);
            if replaced {
                return (
                    LayoutNode::Split {
                        direction: existing_direction,
                        ratio,
                        first: Box::new(new_first),
                        second,
                    },
                    true,
                );
            }
            let (new_second, replaced) =
                replace_layout_leaf(*second, target_pane_id, new_direction, preset, title);
            (
                LayoutNode::Split {
                    direction: existing_direction,
                    ratio,
                    first: Box::new(new_first),
                    second: Box::new(new_second),
                },
                replaced,
            )
        }
    }
}

fn builtin_presets() -> Vec<ResolvedLauncherPreset> {
    vec![
        builtin(BUILTIN_SHELL_ID, "Shell", None, None),
        builtin(
            BUILTIN_CODEX_ID,
            "Codex",
            Some("codex"),
            Some(vec!["codex".into()]),
        ),
        builtin(
            BUILTIN_CLAUDE_ID,
            "Claude",
            Some("claude"),
            Some(vec!["claude".into()]),
        ),
        builtin(BUILTIN_PI_ID, "pi", Some("pi"), Some(vec!["pi".into()])),
    ]
}

fn builtin(
    id: &str,
    label: &str,
    agent_hint: Option<&str>,
    argv: Option<Vec<String>>,
) -> ResolvedLauncherPreset {
    ResolvedLauncherPreset {
        id: id.into(),
        label: label.into(),
        agent_hint: agent_hint.map(str::to_string),
        argv,
        env: HashMap::new(),
        cwd: None,
        built_in: true,
    }
}

fn resolve_config_preset(
    preset: LauncherPresetConfig,
    used_ids: &HashSet<String>,
) -> Result<ResolvedLauncherPreset, String> {
    let id = preset
        .id
        .ok_or_else(|| "invalid preset: id is required".to_string())?
        .trim()
        .to_string();
    validate_slug(&id, "preset id").map_err(|err| format!("invalid preset {id:?}: {err}"))?;
    if used_ids.contains(&id) {
        return Err(format!("invalid preset {id}: duplicate or reserved id"));
    }
    let label = preset
        .label
        .ok_or_else(|| format!("invalid preset {id}: label is required"))?
        .trim()
        .to_string();
    let argv = preset
        .argv
        .ok_or_else(|| format!("invalid preset {id}: argv is required"))?;
    validate_label(&label).map_err(|err| format!("invalid preset {id}: {err}"))?;
    validate_argv(&argv).map_err(|err| format!("invalid preset {id}: {err}"))?;
    validate_env(&preset.env).map_err(|err| format!("invalid preset {id}: {err}"))?;
    let agent_hint = preset
        .agent_hint
        .map(|hint| normalize_agent_hint(&hint))
        .transpose()
        .map_err(|err| format!("invalid preset {id}: {err}"))?;
    if agent_hint.is_some() && preset.env.contains_key("HERDR_AGENT") {
        return Err(format!(
            "invalid preset {id}: env.HERDR_AGENT cannot be set with agent_hint"
        ));
    }
    let cwd = preset
        .cwd
        .map(|cwd| validate_cwd(&cwd).map(|_| cwd))
        .transpose()
        .map_err(|err| format!("invalid preset {id}: {err}"))?;
    Ok(ResolvedLauncherPreset {
        id,
        label,
        agent_hint,
        argv: Some(argv),
        env: preset.env,
        cwd,
        built_in: false,
    })
}

fn default_launcher_presets_path() -> PathBuf {
    env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("HOME").map(|home| PathBuf::from(home).join(".config")))
        .unwrap_or_else(|| PathBuf::from("."))
        .join("herdr-web")
        .join("launcher-presets.json")
}

fn validate_slug(value: &str, label: &str) -> Result<(), String> {
    if value.is_empty() || value.len() > MAX_PRESET_ID_BYTES {
        return Err(format!("{label} must be 1-{MAX_PRESET_ID_BYTES} bytes"));
    }
    if !value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | ':' | '.'))
    {
        return Err(format!(
            "{label} must contain only ASCII letters, digits, '.', ':', '_' or '-'"
        ));
    }
    Ok(())
}

fn validate_label(value: &str) -> Result<(), String> {
    if value.trim().is_empty() || value.len() > MAX_LABEL_BYTES || value.contains('\0') {
        return Err(format!(
            "label must be non-empty, NUL-free, and up to {MAX_LABEL_BYTES} bytes"
        ));
    }
    Ok(())
}

fn validate_argv(argv: &[String]) -> Result<(), String> {
    if argv.is_empty() {
        return Err("argv must not be empty".into());
    }
    if argv.iter().any(|arg| arg.is_empty() || arg.contains('\0')) {
        return Err("argv entries must be non-empty and NUL-free".into());
    }
    Ok(())
}

fn validate_env(env: &HashMap<String, String>) -> Result<(), String> {
    for (key, value) in env {
        if key.is_empty() || key.contains('=') || key.contains('\0') {
            return Err(format!("env key {key:?} is invalid"));
        }
        if value.contains('\0') {
            return Err(format!("env value for {key} must be NUL-free"));
        }
    }
    Ok(())
}

fn normalize_agent_hint(value: &str) -> Result<String, String> {
    let hint = value.trim().to_ascii_lowercase();
    validate_slug(&hint, "agent_hint")?;
    if KNOWN_AGENT_HINTS.contains(&hint.as_str()) {
        Ok(hint)
    } else {
        Err(format!("agent_hint {value:?} is not a known Herdr agent"))
    }
}

fn validate_cwd(value: &str) -> Result<(), String> {
    if value.contains('\0') {
        return Err("cwd must be NUL-free".into());
    }
    let path = Path::new(value);
    if !path.is_absolute() {
        return Err("cwd must be absolute".into());
    }
    if !path.is_dir() {
        return Err("cwd must exist and be a directory".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_file_returns_builtins() {
        let store =
            LauncherPresetStore::load_from_path(Path::new("/definitely/missing.json")).unwrap();
        let response = store.response();
        assert_eq!(response.presets.len(), 4);
        assert_eq!(response.presets[0].id, "builtin:shell");
    }

    #[test]
    fn explicit_missing_file_returns_warning() {
        let store = LauncherPresetStore::load_from_path_with_mode(
            Path::new("/definitely/missing.json"),
            true,
        )
        .unwrap();
        let response = store.response();
        assert_eq!(response.presets.len(), 4);
        assert_eq!(response.warnings.len(), 1);
        assert!(response.warnings[0].contains("file not found"));
    }

    #[test]
    fn implicit_invalid_file_returns_builtins_with_warning() {
        let root = unique_test_dir("launcher-presets-invalid-json");
        fs::create_dir_all(&root).unwrap();
        let path = root.join("presets.json");
        fs::write(&path, "{").unwrap();

        let store = LauncherPresetStore::load_from_path(&path).unwrap();
        let response = store.response();

        assert_eq!(response.presets.len(), 4);
        assert_eq!(response.presets[0].id, "builtin:shell");
        assert_eq!(response.warnings.len(), 1);
        assert!(response.warnings[0].contains("parse error"));
    }

    #[test]
    fn explicit_invalid_file_returns_error() {
        let root = unique_test_dir("launcher-presets-explicit-invalid-json");
        fs::create_dir_all(&root).unwrap();
        let path = root.join("presets.json");
        fs::write(&path, "{").unwrap();

        let err = LauncherPresetStore::load_from_path_with_mode(&path, true).unwrap_err();

        assert!(err.contains("parse error"));
    }

    #[test]
    fn invalid_presets_are_omitted_with_warnings() {
        let root = unique_test_dir("launcher-presets-invalid");
        fs::create_dir_all(&root).unwrap();
        let path = root.join("presets.json");
        fs::write(
            &path,
            r#"{"version":1,"presets":[
                {"id":"bad space","label":"Bad","argv":["bad"]},
                {"id":"missing-argv","label":"Missing argv"},
                {"id":"bad-type","label":"Bad Type","argv":"codex"},
                {"id":"ok","label":"OK","agent_hint":"codex","argv":["codex","--model","gpt-5"]}
            ]}"#,
        )
        .unwrap();
        let store = LauncherPresetStore::load_from_path(&path).unwrap();
        assert!(store.preset("bad space").is_none());
        assert!(store.preset("missing-argv").is_none());
        assert!(store.preset("bad-type").is_none());
        assert!(store.preset("ok").is_some());
        assert_eq!(store.response().warnings.len(), 3);
    }

    #[test]
    fn unknown_preset_fields_are_omitted_with_warnings() {
        let root = unique_test_dir("launcher-presets-unknown-field");
        fs::create_dir_all(&root).unwrap();
        let path = root.join("presets.json");
        fs::write(
            &path,
            r#"{"version":1,"presets":[
                {"id":"unknown","label":"Unknown","argv":["agent"],"unexpected":true},
                {"id":"ok","label":"OK","agent_hint":"codex","argv":["codex"]}
            ]}"#,
        )
        .unwrap();

        let store = LauncherPresetStore::load_from_path(&path).unwrap();
        let response = store.response();

        assert!(store.preset("unknown").is_none());
        assert!(store.preset("ok").is_some());
        assert_eq!(response.warnings.len(), 1);
        assert!(response.warnings[0].contains("unknown field `unexpected`"));
    }

    #[test]
    fn agent_hint_injects_herdr_agent() {
        let preset = resolve_config_preset(
            LauncherPresetConfig {
                id: Some("remote-codex".into()),
                label: Some("Remote Codex".into()),
                argv: Some(vec!["ssh".into(), "host".into(), "codex".into()]),
                agent_hint: Some("codex".into()),
                env: HashMap::from([("FOO".into(), "bar".into())]),
                cwd: None,
            },
            &HashSet::new(),
        )
        .unwrap();
        assert_eq!(preset.launch_env()["HERDR_AGENT"], "codex");
        assert_eq!(preset.launch_env()["FOO"], "bar");
    }

    #[test]
    fn env_herdr_agent_without_hint_does_not_set_hint() {
        let preset = resolve_config_preset(
            LauncherPresetConfig {
                id: Some("wrapped".into()),
                label: Some("Wrapped".into()),
                argv: Some(vec!["wrapped".into()]),
                agent_hint: None,
                env: HashMap::from([("HERDR_AGENT".into(), "codex".into())]),
                cwd: None,
            },
            &HashSet::new(),
        )
        .unwrap();
        assert!(preset.agent_hint.is_none());
        assert_eq!(preset.launch_env()["HERDR_AGENT"], "codex");
    }

    #[test]
    fn duplicate_builtin_ids_are_omitted() {
        let used = HashSet::from(["builtin:codex".to_string()]);
        let err = resolve_config_preset(
            LauncherPresetConfig {
                id: Some("builtin:codex".into()),
                label: Some("Codex".into()),
                argv: Some(vec!["codex".into()]),
                agent_hint: None,
                env: HashMap::new(),
                cwd: None,
            },
            &used,
        )
        .unwrap_err();
        assert!(err.contains("duplicate or reserved"));
    }

    #[test]
    fn split_layout_preserves_existing_target_leaf() {
        let preset = ResolvedLauncherPreset {
            id: "custom".into(),
            label: "Custom".into(),
            agent_hint: None,
            argv: Some(vec!["custom".into()]),
            env: HashMap::new(),
            cwd: None,
            built_in: false,
        };
        let root = LayoutNode::Pane {
            pane: LayoutPane {
                pane_id: Some("pane-1".into()),
                label: Some("Existing".into()),
                ..Default::default()
            },
        };
        let updated = split_layout_with_command_preset(
            root,
            "pane-1",
            SplitDirection::Right,
            &preset,
            "Custom",
        )
        .unwrap();
        let LayoutNode::Split { first, second, .. } = updated else {
            panic!("expected split");
        };
        let LayoutNode::Pane { pane: first } = *first else {
            panic!("expected first pane");
        };
        let LayoutNode::Pane { pane: second } = *second else {
            panic!("expected second pane");
        };
        assert_eq!(first.pane_id.as_deref(), Some("pane-1"));
        assert_eq!(second.command, Some(vec!["custom".into()]));
    }

    fn unique_test_dir(name: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        env::temp_dir().join(format!("{name}-{}-{nanos}", std::process::id()))
    }
}
