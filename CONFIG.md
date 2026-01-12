# 配置文件使用指南

## 概述

现在支持通过配置文件设置 `apiKey` 和 `baseUrl`，同时保留环境变量作为备选方案。

## 配置优先级

1. **配置文件值**（最高优先级）
2. **环境变量**（备选方案）
3. **验证错误**（如果两者都未设置）

## 配置文件位置

### 系统级配置（所有项目共享）

**macOS/Linux:**
```
~/.config/ai-agent/config.toml
```

**Windows:**
```
%APPDATA%\ai-agent\config.toml
```

### 项目级配置（仅当前项目）

```
.ai-agent/config.toml
```

项目级配置会覆盖系统级配置。

## 配置示例

### 基本配置

```toml
# API Configuration
apiKey = "your-api-key-here"
baseUrl = "https://api.openai.com/v1"

# Model Configuration
[model]
name = "gpt-4"
temperature = 1.0
contextWindow = 128000

# Approval Policy
approval = "on-request"
```

### 完整配置示例

查看 `config.example.toml` 获取完整配置示例。

## 使用方法

### 方法 1: 使用配置文件（推荐）

1. 创建配置文件：
   ```bash
   mkdir -p ~/.config/ai-agent
   cp config.example.toml ~/.config/ai-agent/config.toml
   ```

2. 编辑配置文件，设置你的 `apiKey` 和 `baseUrl`：
   ```toml
   apiKey = "sk-your-actual-api-key"
   baseUrl = "https://api.openai.com/v1"
   ```

3. 运行程序：
   ```bash
   pnpm run dev
   ```

### 方法 2: 使用环境变量

```bash
export API_KEY="your-api-key"
export BASE_URL="https://api.openai.com/v1"
pnpm run dev
```

### 方法 3: 混合使用

配置文件和环境变量可以混合使用。如果配置文件中设置了 `apiKey`，则使用配置文件的值；如果未设置，则使用环境变量。

示例：
- 配置文件设置 `apiKey`，环境变量设置 `BASE_URL` → 使用配置文件的 `apiKey` 和环境变量的 `BASE_URL`
- 配置文件未设置 `apiKey`，环境变量设置 `API_KEY` → 使用环境变量的 `API_KEY`

## 配置验证

程序启动时会验证配置：
- 如果 `apiKey` 既不在配置文件中也不在环境变量中，会显示错误并退出
- `baseUrl` 是可选的，如果未设置，OpenAI SDK 会使用默认值

## 安全建议

1. **不要将配置文件提交到版本控制**
   - 将 `.ai-agent/config.toml` 添加到 `.gitignore`
   - 使用 `config.example.toml` 作为模板

2. **使用项目级配置存储敏感信息**
   - 项目级配置（`.ai-agent/config.toml`）不会被提交到版本控制
   - 系统级配置（`~/.config/ai-agent/config.toml`）在所有项目间共享

3. **环境变量方式**
   - 适合 CI/CD 环境
   - 适合临时测试

## 测试配置

运行测试脚本验证配置功能：

```bash
pnpm exec tsx test-config.ts
```

## 故障排除

### 问题：找不到 API key

**错误信息：**
```
No API key found. Set 'apiKey' in config file or API_KEY environment variable
```

**解决方案：**
1. 检查配置文件路径是否正确
2. 检查配置文件中 `apiKey` 字段是否正确设置
3. 或者设置环境变量 `API_KEY`

### 问题：配置文件格式错误

**错误信息：**
```
Invalid TOML in /path/to/config.toml: ...
```

**解决方案：**
1. 检查 TOML 语法是否正确
2. 使用在线 TOML 验证器验证配置文件
3. 参考 `config.example.toml` 示例

### 问题：baseUrl 格式错误

**错误信息：**
```
Invalid configuration: baseUrl must be a valid URL
```

**解决方案：**
1. 确保 `baseUrl` 是有效的 URL（包含协议，如 `https://`）
2. 或者移除 `baseUrl` 字段，使用默认值

## 示例配置文件

项目根目录包含两个示例配置文件：
- `config.example.toml` - 系统级配置示例
- `.ai-agent/config.example.toml` - 项目级配置示例

可以直接复制并修改这些文件。
