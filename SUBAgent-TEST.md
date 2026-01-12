# Subagent 功能验证指南

本文档介绍如何验证 subagent 的功能。

## 快速开始

### 方法 1: 命令行测试脚本

使用提供的测试脚本直接测试 subagent：

```bash
# 查看帮助
pnpm exec tsx test-subagent.ts --help

# 列出所有可用的 subagents
pnpm exec tsx test-subagent.ts --list

# 测试 codebase_investigator
pnpm exec tsx test-subagent.ts codebase_investigator "找到所有使用数据库的函数"

# 测试 code_reviewer
pnpm exec tsx test-subagent.ts code_reviewer "审查 src/main.ts 文件"
```

### 方法 2: 交互式测试

使用交互式测试脚本：

```bash
pnpm exec tsx test-subagent-interactive.ts
```

这会启动一个交互式界面，让你选择 subagent 并输入目标。

### 方法 3: 在 Agent 中直接使用

在交互模式下，直接调用 subagent：

```bash
pnpm run dev
```

然后在交互界面中输入：

```
使用 subagent_codebase_investigator 工具，目标是："找到所有使用数据库的函数"
```

## 测试用例

### Codebase Investigator 测试用例

#### 测试 1: 查找特定函数
```
目标: "找到所有使用 'readFileSync' 的函数"
预期: subagent 应该使用 grep 和 read_file 工具查找相关代码
```

#### 测试 2: 理解代码结构
```
目标: "解释 src/agent/agent.ts 文件的主要功能"
预期: subagent 应该读取文件并分析其结构
```

#### 测试 3: 查找模式
```
目标: "找到所有实现 Tool 接口的类"
预期: subagent 应该使用 grep 查找 "extends Tool" 或 "implements Tool"
```

### Code Reviewer 测试用例

#### 测试 1: 代码审查
```
目标: "审查 src/main.ts 文件，查找潜在问题"
预期: subagent 应该读取文件并指出 bug、代码异味、安全问题等
```

#### 测试 2: 代码质量检查
```
目标: "检查 src/tools/ 目录下的代码质量"
预期: subagent 应该检查多个文件并提供改进建议
```

## 验证要点

### 1. 工具限制验证

验证 subagent 只能使用允许的工具：

```bash
# 测试 codebase_investigator（应该只能使用 read_file, grep, glob, list_dir）
pnpm exec tsx test-subagent.ts codebase_investigator "列出所有文件"

# 验证它不会尝试使用 write_file 或 shell 工具
```

### 2. 超时控制验证

验证 subagent 在超时后能正确终止：

```typescript
// 创建一个会超时的测试（需要修改配置）
const config = {
  ...defaultConfig,
  subagents: [{
    name: "test_timeout",
    timeoutSeconds: 1, // 1秒超时
    goalPrompt: "执行一个需要很长时间的任务"
  }]
};
```

### 3. 轮次限制验证

验证 subagent 在达到最大轮次后能正确终止：

```typescript
// code_reviewer 有 maxTurns: 10
// 验证它不会超过 10 轮
```

### 4. 结果格式验证

验证 subagent 返回的结果格式正确：

```typescript
const result = await tool.execute(invocation);
// 应该包含:
// - Termination reason (goal/timeout/error)
// - Tools called list
// - Final response
```

## 预期行为

### 成功执行

当 subagent 成功完成任务时，应该：

1. ✅ 返回 `success: true`
2. ✅ 包含 `Termination: goal`
3. ✅ 列出使用的工具
4. ✅ 提供最终响应

### 超时

当 subagent 超时时，应该：

1. ✅ 返回 `success: false`
2. ✅ 包含 `Termination: timeout`
3. ✅ 显示超时消息

### 错误

当 subagent 遇到错误时，应该：

1. ✅ 返回 `success: false`
2. ✅ 包含 `Termination: error`
3. ✅ 显示错误信息

## 调试技巧

### 启用调试模式

在配置文件中设置：

```toml
debug = true
```

### 查看工具调用

subagent 执行时会显示：
- 使用的工具列表
- 每个工具的参数
- 工具的执行结果

### 检查日志

查看控制台输出，subagent 会显示：
- 开始执行
- 工具调用
- 最终结果

## 常见问题

### Q: Subagent 没有响应？

A: 检查：
1. API key 是否正确配置
2. 网络连接是否正常
3. 超时设置是否合理

### Q: Subagent 使用了不允许的工具？

A: 检查：
1. `allowedTools` 配置是否正确
2. 工具注册表是否正确过滤工具

### Q: Subagent 结果不准确？

A: 检查：
1. 目标描述是否清晰
2. 是否提供了足够的上下文
3. 是否需要调整 `goalPrompt`

## 性能基准

### Codebase Investigator

- 简单查询（1-2 个文件）: < 10 秒
- 中等查询（5-10 个文件）: 10-30 秒
- 复杂查询（整个目录）: 30-60 秒

### Code Reviewer

- 单个文件审查: 10-20 秒
- 多个文件审查: 20-60 秒

## 示例输出

### 成功示例

```
Sub-agent 'codebase_investigator' completed.
Termination: goal
Tools called: read_file, grep, list_dir

Result:
找到了以下使用数据库的函数：
1. src/db/connection.ts:connectToDatabase()
2. src/models/user.ts:getUserById()
...
```

### 超时示例

```
Sub-agent 'codebase_investigator' completed.
Termination: timeout
Tools called: read_file, grep, glob

Result:
Sub-agent timed out
```

## 下一步

验证 subagent 功能后，可以：

1. 创建自定义 subagent（在配置文件中）
2. 调整现有 subagent 的参数
3. 集成到实际工作流程中
