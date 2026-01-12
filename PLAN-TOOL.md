# Plan Tool 使用指南

Plan Tool 是一个强大的任务规划和管理工具，可以帮助 Agent 将复杂任务分解为可执行的步骤，并跟踪执行进度。

## 功能特性

- ✅ **创建计划** - 将复杂任务分解为步骤
- ✅ **查看计划** - 查看当前计划详情
- ✅ **更新计划** - 修改计划步骤或状态
- ✅ **执行计划** - 按顺序执行计划步骤
- ✅ **状态跟踪** - 跟踪每个步骤的执行状态
- ✅ **依赖管理** - 支持步骤间的依赖关系
- ✅ **进度统计** - 显示计划完成百分比

## 使用方法

### 1. 创建计划

```json
{
  "action": "create",
  "task": "重构用户认证系统",
  "plan": "- 分析现有代码结构\n- 设计新的认证流程\n- 实现新的认证模块\n- 编写单元测试\n- 更新文档"
}
```

### 2. 查看计划

```json
{
  "action": "view"
}
```

### 3. 查看计划状态

```json
{
  "action": "status"
}
```

### 4. 执行下一步

```json
{
  "action": "execute"
}
```

或者执行特定步骤：

```json
{
  "action": "execute",
  "step_id": "step-1"
}
```

### 5. 更新步骤状态

```json
{
  "action": "update",
  "step_id": "step-1",
  "step_status": "completed"
}
```

### 6. 更新整个计划

```json
{
  "action": "update",
  "plan": "- 步骤1\n- 步骤2\n- 步骤3"
}
```

### 7. 清除计划

```json
{
  "action": "clear"
}
```

## 步骤状态

- `pending` - 待执行
- `in_progress` - 执行中
- `completed` - 已完成
- `failed` - 失败
- `skipped` - 已跳过

## 步骤依赖

计划支持步骤间的依赖关系。在计划中使用以下格式：

```
- 步骤1
- 步骤2
  depends: step-1
- 步骤3
  depends: step-1, step-2
```

## 使用示例

### 示例 1: 代码重构任务

```json
{
  "action": "create",
  "task": "重构用户认证模块",
  "plan": "- 阅读现有代码\n- 识别需要重构的部分\n- 设计新的架构\n- 实现新代码\n- 编写测试\n- 更新文档"
}
```

然后执行：

```json
{
  "action": "execute"
}
```

执行完第一步后，更新状态：

```json
{
  "action": "update",
  "step_id": "step-1",
  "step_status": "completed"
}
```

继续执行下一步：

```json
{
  "action": "execute"
}
```

### 示例 2: 多文件修改任务

```json
{
  "action": "create",
  "task": "添加新功能到多个文件",
  "plan": "- 修改文件A\n- 修改文件B\n- 修改文件C\n- 运行测试\n- 更新文档"
}
```

### 示例 3: 带依赖的任务

```json
{
  "action": "create",
  "task": "部署新版本",
  "plan": "- 运行测试套件\n- 构建项目\n  depends: step-1\n- 部署到测试环境\n  depends: step-2\n- 验证部署\n  depends: step-3\n- 部署到生产环境\n  depends: step-4"
}
```

## 工作流程

1. **创建计划** - 使用 `create` 动作创建新计划
2. **查看计划** - 使用 `view` 查看计划详情
3. **执行步骤** - 使用 `execute` 执行下一步或特定步骤
4. **更新状态** - 完成步骤后，使用 `update` 标记为 `completed`
5. **继续执行** - 重复步骤 3-4 直到所有步骤完成
6. **查看进度** - 使用 `status` 查看整体进度

## 与 Todos Tool 的区别

- **Plan Tool**: 用于复杂任务的详细规划，支持步骤依赖和状态跟踪
- **Todos Tool**: 用于简单的任务列表管理，更轻量级

## 最佳实践

1. **明确任务描述** - 提供清晰的任务描述
2. **详细步骤** - 将任务分解为具体可执行的步骤
3. **合理依赖** - 设置步骤间的依赖关系
4. **及时更新** - 完成步骤后及时更新状态
5. **查看进度** - 定期查看计划状态了解进度

## 输出格式

### 计划视图

```
Task: 重构用户认证系统

Plan:
- 分析现有代码结构
- 设计新的认证流程
- 实现新的认证模块
- 编写单元测试
- 更新文档

Steps (5):
  ○ [step-1] 分析现有代码结构 (pending)
  ○ [step-2] 设计新的认证流程 (pending)
  ○ [step-3] 实现新的认证模块 (pending)
  ○ [step-4] 编写单元测试 (pending)
  ○ [step-5] 更新文档 (pending)
```

### 状态视图

```
Plan Status:
Task: 重构用户认证系统

Steps: 5 total
  - Pending: 3
  - In Progress: 1
  - Completed: 1
  - Failed: 0
  - Skipped: 0

Progress: 20%
```

## 注意事项

1. 计划是会话级别的，不会持久化到磁盘
2. 每次只能有一个活动计划
3. 创建新计划会覆盖现有计划
4. 步骤 ID 是自动生成的（step-1, step-2, ...）
5. 依赖检查确保步骤按正确顺序执行
