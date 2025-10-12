# Agent API

This API provides agent functionality for the life management system. It serves as a backend service for AI-powered agents that can assist with various life management tasks.

## Purpose

This API provides a foundation for building intelligent agents that can process requests, make decisions, and interact with external services. It's designed to be extensible and can be adapted for different types of agent-based applications.

## Tech Stack

* **NestJS** - Node.js framework
* **Vault** - secrets management
* **TypeScript** - type safety and modern JavaScript features

## Features

* **Configuration Management** - Centralized configuration with Vault integration
* **Secrets Management** - Secure handling of API keys and sensitive data
* **Modular Architecture** - Clean, extensible structure for adding new features
* **Docker Support** - Containerized deployment ready

## Getting Started

### Prerequisites

- Node.js 20+
- Docker (optional)
- Vault server (for production secrets)

### Installation

```bash
npm install
```

### Development

```bash
npm run start:dev
```

### Production

```bash
npm run build
npm run start:prod
```

## Configuration

The API uses Vault for secrets management. Configure the following environment variables:

- `VAULT_ADDR` - Vault server address
- `VAULT_TOKEN` - Vault authentication token
- `NODE_ENV` - Environment (development/production)
- `PORT` - Server port (default: 3000)

## Architecture

The API follows a modular architecture with:

- **Config Module** - Handles configuration and secrets
- **Vault Module** - Manages Vault integration
- **Main Application** - Entry point and global configuration

## Extending the API

To add new functionality:

1. Create new modules in the `src/` directory
2. Import modules in `app.module.ts`
3. Add any required dependencies to `package.json`
4. Update configuration if needed

## Deployment

The API includes Docker support and GitHub Actions workflow for automated deployment. See `.github/workflows/workflow.yml` for deployment configuration.