# Windows打包构建指南

## 概述
本项目使用GitHub Actions自动为Windows构建和打包应用。支持两种工作流：
- **build.yml**: 每次push到dev分支自动构建
- **release.yml**: 推送dev分支或版本标签时自动创建Release并上传构件

## 快速开始

### 方式1: 自动构建（推送到dev分支）
```bash
git push origin dev
```
Actions会自动触发构建，完成后可在Actions选项卡查看日志和下载构件。

### 方式2: 发布版本（创建标签）
```bash
# 创建版本标签
git tag -a v1.6.9 -m "Release version 1.6.9"
git push origin v1.6.9
```
Actions会自动创建GitHub Release并上传Windows、macOS等安装包。

### 方式3: 手动触发构建
1. 进入GitHub仓库的Actions选项卡
2. 选择"Build Windows"工作流
3. 点击"Run workflow"按钮
4. 完成后在构件中下载

## 工作流说明

### build.yml - 持续构建
- **触发条件**: 
  - push到dev分支
  - 手动触发(workflow_dispatch)
- **构建内容**:
  - 安装Node依赖(pnpm)
  - 构建前端资源
  - 编译Rust代码
  - 打包Windows安装程序
- **输出**: 构件包含完整的bundle目录

### release.yml - 发布流程
- **触发条件**:
  - push到dev分支，生成开发预发布构件
  - 推送版本标签(v*)，生成正式Release
- **工作流步骤**:
  1. 创建GitHub Release
  2. 并行构建Windows和macOS版本
  3. 自动上传安装包到Release页面
- **输出**: Release页面包含可下载的安装文件

## 环境要求

### 项目文件配置
确保以下文件存在且配置正确:
- `src-tauri/tauri.conf.json` - Tauri应用配置
- `src-tauri/Cargo.toml` - Rust依赖
- `package.json` 或 `pnpm-lock.yaml` - 前端依赖
- `dist/` 目录 - 构建输出(自动生成)

### GitHub仓库权限
仓库需要启用以下权限:
- **Actions**: 读写权限(自动授予)
- **Contents**: 写权限(创建Release和上传构件)
- **Packages**: 可选(如果使用GitHub Packages)

## 版本号管理

### 更新版本号
编辑 `src-tauri/tauri.conf.json`:
```json
{
  "version": "1.6.9"
}
```

### 发布版本
```bash
# 更新版本号后
git add src-tauri/tauri.conf.json
git commit -m "chore: bump version to 1.6.9"

# 创建标签并推送
git tag -a v1.6.9 -m "Release version 1.6.9"
git push origin dev
git push origin v1.6.9
```

## Windows特定配置

### 代码签名(可选)
如需对Windows安装程序签名，修改 `src-tauri/tauri.conf.json`:
```json
{
  "bundle": {
    "windows": {
      "certificateThumbprint": "your-certificate-thumbprint",
      "digestAlgorithm": "sha256",
      "timestampUrl": "http://timestamp.server.com"
    }
  }
}
```

### 自定义安装程序
修改NSIS配置:
```json
{
  "bundle": {
    "windows": {
      "nsis": {
        "installMode": "both",
        "languages": ["en-US", "zh-CN"]
      }
    }
  }
}
```

## 常见问题

### Q: 构建失败，提示找不到Node模块
A: 确保:
1. `pnpm-lock.yaml` 已提交
2. 没有被`.gitignore`忽略
3. Node版本与`package.json`的engines字段兼容

### Q: 构建很慢
A: 
- Rust首次编译需要较长时间(10-15分钟)
- 使用缓存加速: 检查Actions日志中的缓存命中率
- 考虑在本地测试后再推送

### Q: Release资源名称不对
A: 编辑 `release.yml` 中的 `asset_path` 和 `asset_name`:
```yaml
- name: Upload installer
  with:
    asset_path: ./src-tauri/target/release/bundle/nsis/YOUR_APP_NAME.exe
    asset_name: OCS-Chat-Windows-x64.exe
```

### Q: 如何跳过某次构建
A: 在commit消息中添加 `[skip ci]`:
```bash
git commit -m "docs: update README [skip ci]"
```

## 本地构建测试

在推送前可本地测试:
```bash
# 安装dependencies
pnpm install

# 开发模式
pnpm dev

# 构建frontend
pnpm build

# 构建Windows安装包
cd src-tauri
cargo tauri build -- --target x86_64-pc-windows-msvc
```

## 获取构建产物

### 从Actions获取(临时存储)
1. GitHub Actions → Build Windows工作流
2. 选择最新的workflow run
3. Artifacts部分下载windows-build.zip

### 从Release获取(永久保存)
1. GitHub Releases页面
2. 下载对应版本的.exe文件

## 脚本自动化建议

创建`scripts/release.sh`以简化发布流程:
```bash
#!/bin/bash
set -e

VERSION=$1
if [ -z "$VERSION" ]; then
  echo "Usage: ./scripts/release.sh <version>"
  exit 1
fi

# 更新版本号
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" src-tauri/tauri.conf.json

# 提交并标记
git add src-tauri/tauri.conf.json
git commit -m "chore: bump version to $VERSION"
git tag -a "v$VERSION" -m "Release version $VERSION"

# 推送
git push origin dev
git push origin "v$VERSION"

echo "✓ Released v$VERSION"
```

使用:
```bash
chmod +x scripts/release.sh
./scripts/release.sh 1.6.9
```
