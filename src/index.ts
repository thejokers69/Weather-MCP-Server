import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ============================================================================
// CONSTANTS AND CONFIGURATION
// ============================================================================

const CONFIG = {
  NWS_API_BASE: "https://api.weather.gov",
  USER_AGENT: "weather-app/1.0",
  SERVER_NAME: "weather",
  SERVER_VERSION: "1.0.0",
  COORDINATE_PRECISION: 4,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // ms
} as const;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface AlertFeature {
  properties: {
    event?: string;
    areaDesc?: string;
    severity?: string;
    status?: string;
    headline?: string;
  };
}

interface ForecastPeriod {
  name?: string;
  temperature?: number;
  temperatureUnit?: string;
  windSpeed?: string;
  windDirection?: string;
  shortForecast?: string;
}

interface AlertsResponse {
  features: AlertFeature[];
}

interface PointsResponse {
  properties: {
    forecast?: string;
  };
}

interface ForecastResponse {
  properties: {
    periods: ForecastPeriod[];
  };
}

interface WeatherError extends Error {
  code: string;
  statusCode?: number;
  retryable: boolean;
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

class WeatherServiceError extends Error implements WeatherError {
  public code: string;
  public statusCode?: number;
  public retryable: boolean;

  constructor(message: string, code: string, statusCode?: number, retryable = false) {
    super(message);
    this.name = "WeatherServiceError";
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format coordinates to the required precision
 */
function formatCoordinates(lat: number, lon: number): string {
  return `${lat.toFixed(CONFIG.COORDINATE_PRECISION)},${lon.toFixed(CONFIG.COORDINATE_PRECISION)}`;
}

/**
 * Validate state code format
 */
function validateStateCode(state: string): string {
  const stateCode = state.toUpperCase();
  if (!/^[A-Z]{2}$/.test(stateCode)) {
    throw new WeatherServiceError(
      `Invalid state code: ${state}. Must be a two-letter state code (e.g., CA, NY)`,
      "INVALID_STATE_CODE"
    );
  }
  return stateCode;
}

/**
 * Validate coordinates
 */
function validateCoordinates(latitude: number, longitude: number): void {
  if (latitude < -90 || latitude > 90) {
    throw new WeatherServiceError(
      `Invalid latitude: ${latitude}. Must be between -90 and 90`,
      "INVALID_LATITUDE"
    );
  }
  if (longitude < -180 || longitude > 180) {
    throw new WeatherServiceError(
      `Invalid longitude: ${longitude}. Must be between -180 and 180`,
      "INVALID_LONGITUDE"
    );
  }
}

// ============================================================================
// API CLIENT
// ============================================================================

class NWSAPIClient {
  private baseUrl: string;
  private userAgent: string;

  constructor(baseUrl: string, userAgent: string) {
    this.baseUrl = baseUrl;
    this.userAgent = userAgent;
  }

  /**
   * Make a request to the NWS API with retry logic
   */
  async makeRequest<T>(url: string, retries = CONFIG.MAX_RETRIES): Promise<T> {
    const headers = {
      "User-Agent": this.userAgent,
      Accept: "application/geo+json",
    };

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, { headers });
        
        if (!response.ok) {
          const errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          const isRetryable = response.status >= 500 || response.status === 429;
          
          if (attempt === retries) {
            throw new WeatherServiceError(
              errorMessage,
              "API_REQUEST_FAILED",
              response.status,
              isRetryable
            );
          }
          
          if (isRetryable) {
            console.warn(`Attempt ${attempt} failed, retrying in ${CONFIG.RETRY_DELAY}ms...`);
            await sleep(CONFIG.RETRY_DELAY);
            continue;
          }
          
          throw new WeatherServiceError(
            errorMessage,
            "API_REQUEST_FAILED",
            response.status,
            false
          );
        }

        return await response.json() as T;
      } catch (error) {
        if (error instanceof WeatherServiceError) {
          throw error;
        }
        
        if (attempt === retries) {
          throw new WeatherServiceError(
            `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            "NETWORK_ERROR",
            undefined,
            true
          );
        }
        
        console.warn(`Attempt ${attempt} failed, retrying in ${CONFIG.RETRY_DELAY}ms...`);
        await sleep(CONFIG.RETRY_DELAY);
      }
    }

    throw new WeatherServiceError("Max retries exceeded", "MAX_RETRIES_EXCEEDED");
  }

  /**
   * Get weather alerts for a state
   */
  async getAlerts(stateCode: string): Promise<AlertsResponse> {
    const url = `${this.baseUrl}/alerts?area=${stateCode}`;
    return this.makeRequest<AlertsResponse>(url);
  }

  /**
   * Get grid point data for coordinates
   */
  async getGridPoint(latitude: number, longitude: number): Promise<PointsResponse> {
    const coordinates = formatCoordinates(latitude, longitude);
    const url = `${this.baseUrl}/points/${coordinates}`;
    return this.makeRequest<PointsResponse>(url);
  }

  /**
   * Get forecast data from a forecast URL
   */
  async getForecast(forecastUrl: string): Promise<ForecastResponse> {
    return this.makeRequest<ForecastResponse>(forecastUrl);
  }
}

// ============================================================================
// DATA FORMATTERS
// ============================================================================

class WeatherDataFormatter {
  /**
   * Format alert data for display
   */
  static formatAlert(feature: AlertFeature): string {
    const props = feature.properties;
    return [
      `Event: ${props.event || "Unknown"}`,
      `Area: ${props.areaDesc || "Unknown"}`,
      `Severity: ${props.severity || "Unknown"}`,
      `Status: ${props.status || "Unknown"}`,
      `Headline: ${props.headline || "No headline"}`,
      "---",
    ].join("\n");
  }

  /**
   * Format forecast period for display
   */
  static formatForecastPeriod(period: ForecastPeriod): string {
    return [
      `${period.name || "Unknown"}:`,
      `Temperature: ${period.temperature || "Unknown"}°${period.temperatureUnit || "F"}`,
      `Wind: ${period.windSpeed || "Unknown"} ${period.windDirection || ""}`,
      `${period.shortForecast || "No forecast available"}`,
      "---",
    ].join("\n");
  }

  /**
   * Format multiple alerts for display
   */
  static formatAlerts(alerts: AlertFeature[], stateCode: string): string {
    if (alerts.length === 0) {
      return `No active alerts for ${stateCode}`;
    }

    const formattedAlerts = alerts.map(this.formatAlert);
    return `Active alerts for ${stateCode}:\n\n${formattedAlerts.join("\n")}`;
  }

  /**
   * Format forecast for display
   */
  static formatForecast(periods: ForecastPeriod[], latitude: number, longitude: number): string {
    if (periods.length === 0) {
      return "No forecast periods available";
    }

    const formattedPeriods = periods.map(this.formatForecastPeriod);
    return `Forecast for ${latitude}, ${longitude}:\n\n${formattedPeriods.join("\n")}`;
  }
}

// ============================================================================
// WEATHER SERVICE
// ============================================================================

class WeatherService {
  private apiClient: NWSAPIClient;

  constructor() {
    this.apiClient = new NWSAPIClient(CONFIG.NWS_API_BASE, CONFIG.USER_AGENT);
  }

  /**
   * Get weather alerts for a state
   */
  async getAlerts(state: string): Promise<string> {
    try {
      const stateCode = validateStateCode(state);
      const alertsData = await this.apiClient.getAlerts(stateCode);
      const features = alertsData.features || [];
      return WeatherDataFormatter.formatAlerts(features, stateCode);
    } catch (error) {
      if (error instanceof WeatherServiceError) {
        throw error;
      }
      throw new WeatherServiceError(
        `Failed to retrieve alerts: ${error instanceof Error ? error.message : 'Unknown error'}`,
        "ALERTS_RETRIEVAL_FAILED"
      );
    }
  }

  /**
   * Get weather forecast for coordinates
   */
  async getForecast(latitude: number, longitude: number): Promise<string> {
    try {
      validateCoordinates(latitude, longitude);
      
      // Get grid point data
      const pointsData = await this.apiClient.getGridPoint(latitude, longitude);
      const forecastUrl = pointsData.properties?.forecast;
      
      if (!forecastUrl) {
        throw new WeatherServiceError(
          "Failed to get forecast URL from grid point data",
          "FORECAST_URL_MISSING"
        );
      }

      // Get forecast data
      const forecastData = await this.apiClient.getForecast(forecastUrl);
      const periods = forecastData.properties?.periods || [];
      
      return WeatherDataFormatter.formatForecast(periods, latitude, longitude);
    } catch (error) {
      if (error instanceof WeatherServiceError) {
        throw error;
      }
      throw new WeatherServiceError(
        `Failed to retrieve forecast: ${error instanceof Error ? error.message : 'Unknown error'}`,
        "FORECAST_RETRIEVAL_FAILED"
      );
    }
  }
}

// ============================================================================
// MCP SERVER SETUP
// ============================================================================

class WeatherMCPServer {
  private server: McpServer;
  private weatherService: WeatherService;

  constructor() {
    this.server = new McpServer({
      name: CONFIG.SERVER_NAME,
      version: CONFIG.SERVER_VERSION,
      capabilities: {
        resources: {},
        tools: {},
      },
    });
    this.weatherService = new WeatherService();
    this.registerTools();
  }

  /**
   * Register MCP tools
   */
  private registerTools(): void {
    // Register get-alerts tool
    this.server.tool(
      "get-alerts",
      "Get weather alerts for a state",
      {
        state: z.string().length(2).describe("Two-letter state code (e.g. CA, NY)"),
      },
      async ({ state }) => {
        try {
          const result = await this.weatherService.getAlerts(state);
          return {
            content: [{ type: "text", text: result }],
          };
        } catch (error) {
          const errorMessage = error instanceof WeatherServiceError 
            ? `${error.code}: ${error.message}`
            : "Unknown error occurred";
          
          return {
            content: [{ type: "text", text: `Error: ${errorMessage}` }],
          };
        }
      }
    );

    // Register get-forecast tool
    this.server.tool(
      "get-forecast",
      "Get weather forecast for a location",
      {
        latitude: z.number().min(-90).max(90).describe("Latitude of the location"),
        longitude: z.number().min(-180).max(180).describe("Longitude of the location"),
      },
      async ({ latitude, longitude }) => {
        try {
          const result = await this.weatherService.getForecast(latitude, longitude);
          return {
            content: [{ type: "text", text: result }],
          };
        } catch (error) {
          const errorMessage = error instanceof WeatherServiceError 
            ? `${error.code}: ${error.message}`
            : "Unknown error occurred";
          
          return {
            content: [{ type: "text", text: `Error: ${errorMessage}` }],
          };
        }
      }
    );
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Weather MCP Server running on stdio");
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    // Add cleanup logic if needed
  }
}

// ============================================================================
// MAIN APPLICATION
// ============================================================================

async function main(): Promise<void> {
  try {
    const weatherServer = new WeatherMCPServer();
    await weatherServer.start();
  } catch (error) {
    console.error("Fatal error in main():", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.error('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Start the application
main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});