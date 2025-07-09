# Weather MCP Server

A Model Context Protocol (MCP) server that provides real-time weather data and alerts for Claude for Desktop and other MCP clients. This server integrates with the US National Weather Service API to deliver accurate weather forecasts and severe weather alerts.

## Table of contents

- [Weather MCP Server](#weather-mcp-server)
  - [Table of contents](#table-of-contents)
  - [Introduction](#introduction)
  - [Features](#features)
  - [Installation](#installation)
    - [Prerequisites](#prerequisites)
    - [Installation Steps](#installation-steps)
  - [Quick start](#quick-start)
  - [Usage](#usage)
    - [Available Tools](#available-tools)
      - [`get-alerts`](#get-alerts)
      - [`get-forecast`](#get-forecast)
    - [Sample Outputs](#sample-outputs)
  - [Configuration](#configuration)
    - [Claude for Desktop Configuration](#claude-for-desktop-configuration)
    - [Environment Variables](#environment-variables)
  - [API Reference](#api-reference)
    - [National Weather Service API](#national-weather-service-api)
    - [Server Endpoints](#server-endpoints)
  - [Known issues and limitations](#known-issues-and-limitations)
  - [Getting help](#getting-help)
  - [Contributing](#contributing)
    - [Development Setup](#development-setup)
  - [License](#license)
  - [Acknowledgments](#acknowledgments)

## Introduction

Many language models like Claude lack access to real-time data such as weather forecasts and severe weather alerts. This MCP server solves that problem by providing a bridge between Claude for Desktop and the US National Weather Service API.

The server exposes two powerful tools:

* **Weather Alerts**: Get active severe weather alerts for any US state
* **Weather Forecasts**: Get detailed weather forecasts for any US location using coordinates

Built with TypeScript and the official MCP SDK, this server follows the Model Context Protocol specification and integrates seamlessly with Claude for Desktop and other MCP-compatible clients.

## Features

* 🌤️ **Real-time Weather Data**: Access current weather forecasts and alerts
* 🚨 **Severe Weather Alerts**: Get active weather alerts by state
* 📍 **Location-based Forecasts**: Get detailed forecasts using latitude/longitude coordinates
* 🔧 **MCP Compliant**: Built using the official Model Context Protocol SDK
* 🚀 **Zero Configuration**: No API keys required - uses free NWS API
* 📦 **Easy Installation**: Simple npm/pnpm installation process
* 🛡️ **Error Handling**: Robust error handling for network issues and invalid inputs
* 🎯 **TypeScript**: Full TypeScript support with type safety

## Installation

### Prerequisites

* Node.js 18+
* pnpm (recommended) or npm
* TypeScript 5.0+

### Installation Steps

1. **Clone the repository**:

   ```bash
   git clone <repository-url>
   cd weather
   ```

2. **Install dependencies**:

   ```bash
   pnpm install
   ```

3. **Build the project**:

   ```bash
   pnpm build
   ```

4. **Test the server**:

   ```bash
   pnpm start
   ```

You should see: `Weather MCP Server running on stdio`

## Quick start

After installation, the server is ready to use with Claude for Desktop:

1. **Configure Claude for Desktop**:
   Add this to your `claude_desktop_config.json`:

   ```json
   {
     "mcpServers": {
       "weather": {
         "command": "node",
         "args": ["/path/to/weather/build/index.js"],
         "env": {}
       }
     }
   }
   ```

2. **Restart Claude for Desktop**

3. **Test the tools**:
   * Ask Claude: "What are the weather alerts in California?"
   * Ask Claude: "What's the weather forecast for coordinates 40.7128, -74.0060?"

## Usage

### Available Tools

#### `get-alerts`

Get weather alerts for a specific US state.

**Parameters:**

* `state` (string): Two-letter state code (e.g., "CA", "NY", "TX")

**Example:**

```json
{
  "name": "get-alerts",
  "kwargs": {
    "state": "CA"
  }
}
```

#### `get-forecast`

Get weather forecast for a specific location using coordinates.

**Parameters:**

* `latitude` (number): Latitude coordinate (-90 to 90)
* `longitude` (number): Longitude coordinate (-180 to 180)

**Example:**

```json
{
  "name": "get-forecast", 
  "kwargs": {
    "latitude": 40.7128,
    "longitude": -74.0060
  }
}
```

### Sample Outputs

**Weather Alerts:**

```
Active alerts for CA:

Event: Severe Thunderstorm Warning
Area: Los Angeles County
Severity: Severe
Status: Actual
Headline: Severe Thunderstorm Warning issued for Los Angeles County
---
```

**Weather Forecast:**

```
Forecast for 40.7128, -74.0060:

Tonight:
Temperature: 45°F
Wind: 10 mph NW
Mostly clear with a low around 45°F
---

Tomorrow:
Temperature: 62°F  
Wind: 15 mph SW
Sunny with a high near 62°F
---
```

## Configuration

### Claude for Desktop Configuration

The server can be configured in Claude for Desktop's configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "weather": {
      "command": "node",
      "args": ["/absolute/path/to/weather/build/index.js"],
      "env": {}
    }
  }
}
```

### Environment Variables

No environment variables are required. The server uses the free US National Weather Service API which doesn't require authentication.

## API Reference

### National Weather Service API

This server integrates with the [US National Weather Service API](https://www.weather.gov/documentation/services-web-api):

* **Base URL**: `https://api.weather.gov`
* **Authentication**: None required
* **Rate Limits**: None specified
* **Coverage**: United States only

### Server Endpoints

The server exposes two MCP tools that internally call the NWS API:

1. **Alerts Endpoint**: `/alerts?area={state}`
2. **Points Endpoint**: `/points/{lat},{lon}`
3. **Forecast Endpoint**: Dynamically retrieved from points response

## Known issues and limitations

* **US Coverage Only**: The National Weather Service API only covers the United States
* **Coordinate Precision**: Coordinates are rounded to 4 decimal places for API compatibility
* **Network Dependency**: Requires internet connection to access weather data
* **API Reliability**: Depends on the NWS API availability and response times

## Getting help

If you encounter issues:

1. **Check the logs**: The server outputs error messages to stderr
2. **Verify coordinates**: Ensure coordinates are within valid ranges
3. **Test connectivity**: Verify internet connection and NWS API availability
4. **Check configuration**: Ensure Claude for Desktop configuration is correct

For bugs or feature requests, please open an issue on the project repository.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development Setup

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Build and test: `pnpm build && pnpm start`
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

* **Model Context Protocol**: For providing the excellent SDK and specification
* **US National Weather Service**: For providing free, reliable weather data
* **Claude for Desktop**: For implementing MCP client support
* **TypeScript Team**: For the excellent type system and tooling
* **pnpm**: For fast, efficient package management

---

**Author**: Mohamed Lakssir (thejokers69)  
**Version**: 1.0.0  
**Last Updated**: January 2025
