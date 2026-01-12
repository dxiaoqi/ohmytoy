# AI Coding Agent - TypeScript Version

This is the TypeScript/Node.js version of the AI coding agent project, converted from the original Python implementation.

## Features

- Interactive and single-run modes
- Streaming text responses
- Multi-turn conversations with tool calling
- Configurable model settings and temperature
- Built-in tools for file operations, shell commands, web access, etc.
- Context management with automatic compression
- Safety and approval policies
- Session management
- MCP (Model Context Protocol) integration support

## Installation

```bash
npm install
```

## Configuration

### Option 1: Configuration File (Recommended)

Create a config file at `~/.config/ai-agent/config.toml` (system-wide) or `.ai-agent/config.toml` (project-specific):

```toml
# API Configuration
apiKey = "your-api-key-here"
baseUrl = "https://api.openai.com/v1"  # Optional, defaults to OpenAI if not set

# Model Configuration
[model]
name = "gpt-4"
temperature = 1.0
context_window = 128000

# Approval Policy
approval = "on-request"  # Options: on-request, on-failure, auto, auto-edit, never, yolo

# Working Directory
# cwd = "/path/to/working/directory"
```

**Configuration Priority:**
1. Config file values (highest priority)
2. Environment variables (fallback)
3. Validation error if neither is set

### Option 2: Environment Variables

Alternatively, you can set environment variables:

```bash
export API_KEY="your-api-key"
export BASE_URL="https://api.openai.com/v1"  # Optional
```

See `config.example.toml` for a complete configuration example.

## Usage

### Build

```bash
npm run build
```

### Run in development mode

```bash
npm run dev
```

### Run single command

```bash
npm run dev "your prompt here"
```

### Run interactive mode

```bash
npm run dev
```

Then type your prompts or use commands:
- `/help` - Show help
- `/config` - Show current configuration
- `/model <name>` - Change model
- `/approval <policy>` - Change approval policy
- `/exit` - Exit

## Project Structure

```
src/
├── agent/          # Agent core logic
├── client/         # LLM client (OpenAI API)
├── config/         # Configuration management
├── context/        # Context management and compression
├── hooks/          # Hook system
├── prompts/        # System prompts
├── safety/         # Safety and approval management
├── tools/          # Tool system
│   ├── base.ts     # Base tool classes
│   └── builtin/    # Built-in tools
├── utils/          # Utility functions
└── main.ts         # Entry point
```

## Differences from Python Version

1. **Type System**: Uses TypeScript's type system instead of Python's type hints
2. **Async/Await**: Uses JavaScript async/await (similar to Python's async/await)
3. **Dependencies**: 
   - Uses `openai` npm package instead of Python's `openai`
   - Uses `zod` for validation instead of `pydantic`
   - Uses `toml` npm package for TOML parsing
   - Uses `commander` for CLI instead of `click`
4. **File System**: Uses Node.js `fs` module
5. **Path Handling**: Uses Node.js `path` module

## Development

### Type Checking

```bash
npm run typecheck
```

### Building

```bash
npm run build
```

The compiled JavaScript will be in the `dist/` directory.

## Notes

- Some features from the Python version may not be fully implemented yet (e.g., MCP manager, all built-in tools, TUI)
- The UI is currently a simple console interface. A full TUI implementation can be added later.
- Some tools may need additional dependencies or implementation details.

## License

MIT
