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
};
// ============================================================================
// ERROR HANDLING
// ============================================================================
class WeatherServiceError extends Error {
    code;
    statusCode;
    retryable;
    constructor(message, code, statusCode, retryable = false) {
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
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Format coordinates to the required precision
 */
function formatCoordinates(lat, lon) {
    return `${lat.toFixed(CONFIG.COORDINATE_PRECISION)},${lon.toFixed(CONFIG.COORDINATE_PRECISION)}`;
}
/**
 * Validate state code format
 */
function validateStateCode(state) {
    const stateCode = state.toUpperCase();
    if (!/^[A-Z]{2}$/.test(stateCode)) {
        throw new WeatherServiceError(`Invalid state code: ${state}. Must be a two-letter state code (e.g., CA, NY)`, "INVALID_STATE_CODE");
    }
    return stateCode;
}
/**
 * Validate coordinates
 */
function validateCoordinates(latitude, longitude) {
    if (latitude < -90 || latitude > 90) {
        throw new WeatherServiceError(`Invalid latitude: ${latitude}. Must be between -90 and 90`, "INVALID_LATITUDE");
    }
    if (longitude < -180 || longitude > 180) {
        throw new WeatherServiceError(`Invalid longitude: ${longitude}. Must be between -180 and 180`, "INVALID_LONGITUDE");
    }
}
// ============================================================================
// API CLIENT
// ============================================================================
class NWSAPIClient {
    baseUrl;
    userAgent;
    constructor(baseUrl, userAgent) {
        this.baseUrl = baseUrl;
        this.userAgent = userAgent;
    }
    /**
     * Make a request to the NWS API with retry logic
     */
    async makeRequest(url, retries = CONFIG.MAX_RETRIES) {
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
                        throw new WeatherServiceError(errorMessage, "API_REQUEST_FAILED", response.status, isRetryable);
                    }
                    if (isRetryable) {
                        console.warn(`Attempt ${attempt} failed, retrying in ${CONFIG.RETRY_DELAY}ms...`);
                        await sleep(CONFIG.RETRY_DELAY);
                        continue;
                    }
                    throw new WeatherServiceError(errorMessage, "API_REQUEST_FAILED", response.status, false);
                }
                return await response.json();
            }
            catch (error) {
                if (error instanceof WeatherServiceError) {
                    throw error;
                }
                if (attempt === retries) {
                    throw new WeatherServiceError(`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`, "NETWORK_ERROR", undefined, true);
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
    async getAlerts(stateCode) {
        const url = `${this.baseUrl}/alerts?area=${stateCode}`;
        return this.makeRequest(url);
    }
    /**
     * Get grid point data for coordinates
     */
    async getGridPoint(latitude, longitude) {
        const coordinates = formatCoordinates(latitude, longitude);
        const url = `${this.baseUrl}/points/${coordinates}`;
        return this.makeRequest(url);
    }
    /**
     * Get forecast data from a forecast URL
     */
    async getForecast(forecastUrl) {
        return this.makeRequest(forecastUrl);
    }
}
// ============================================================================
// DATA FORMATTERS
// ============================================================================
class WeatherDataFormatter {
    /**
     * Format alert data for display
     */
    static formatAlert(feature) {
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
    static formatForecastPeriod(period) {
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
    static formatAlerts(alerts, stateCode) {
        if (alerts.length === 0) {
            return `No active alerts for ${stateCode}`;
        }
        const formattedAlerts = alerts.map(this.formatAlert);
        return `Active alerts for ${stateCode}:\n\n${formattedAlerts.join("\n")}`;
    }
    /**
     * Format forecast for display
     */
    static formatForecast(periods, latitude, longitude) {
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
    apiClient;
    constructor() {
        this.apiClient = new NWSAPIClient(CONFIG.NWS_API_BASE, CONFIG.USER_AGENT);
    }
    /**
     * Get weather alerts for a state
     */
    async getAlerts(state) {
        try {
            const stateCode = validateStateCode(state);
            const alertsData = await this.apiClient.getAlerts(stateCode);
            const features = alertsData.features || [];
            return WeatherDataFormatter.formatAlerts(features, stateCode);
        }
        catch (error) {
            if (error instanceof WeatherServiceError) {
                throw error;
            }
            throw new WeatherServiceError(`Failed to retrieve alerts: ${error instanceof Error ? error.message : 'Unknown error'}`, "ALERTS_RETRIEVAL_FAILED");
        }
    }
    /**
     * Get weather forecast for coordinates
     */
    async getForecast(latitude, longitude) {
        try {
            validateCoordinates(latitude, longitude);
            // Get grid point data
            const pointsData = await this.apiClient.getGridPoint(latitude, longitude);
            const forecastUrl = pointsData.properties?.forecast;
            if (!forecastUrl) {
                throw new WeatherServiceError("Failed to get forecast URL from grid point data", "FORECAST_URL_MISSING");
            }
            // Get forecast data
            const forecastData = await this.apiClient.getForecast(forecastUrl);
            const periods = forecastData.properties?.periods || [];
            return WeatherDataFormatter.formatForecast(periods, latitude, longitude);
        }
        catch (error) {
            if (error instanceof WeatherServiceError) {
                throw error;
            }
            throw new WeatherServiceError(`Failed to retrieve forecast: ${error instanceof Error ? error.message : 'Unknown error'}`, "FORECAST_RETRIEVAL_FAILED");
        }
    }
}
// ============================================================================
// MCP SERVER SETUP
// ============================================================================
class WeatherMCPServer {
    server;
    weatherService;
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
    registerTools() {
        // Register get-alerts tool
        this.server.tool("get-alerts", "Get weather alerts for a state", {
            state: z.string().length(2).describe("Two-letter state code (e.g. CA, NY)"),
        }, async ({ state }) => {
            try {
                const result = await this.weatherService.getAlerts(state);
                return {
                    content: [{ type: "text", text: result }],
                };
            }
            catch (error) {
                const errorMessage = error instanceof WeatherServiceError
                    ? `${error.code}: ${error.message}`
                    : "Unknown error occurred";
                return {
                    content: [{ type: "text", text: `Error: ${errorMessage}` }],
                };
            }
        });
        // Register get-forecast tool
        this.server.tool("get-forecast", "Get weather forecast for a location", {
            latitude: z.number().min(-90).max(90).describe("Latitude of the location"),
            longitude: z.number().min(-180).max(180).describe("Longitude of the location"),
        }, async ({ latitude, longitude }) => {
            try {
                const result = await this.weatherService.getForecast(latitude, longitude);
                return {
                    content: [{ type: "text", text: result }],
                };
            }
            catch (error) {
                const errorMessage = error instanceof WeatherServiceError
                    ? `${error.code}: ${error.message}`
                    : "Unknown error occurred";
                return {
                    content: [{ type: "text", text: `Error: ${errorMessage}` }],
                };
            }
        });
    }
    /**
     * Start the MCP server
     */
    async start() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error("Weather MCP Server running on stdio");
    }
    /**
     * Stop the MCP server
     */
    async stop() {
        // Add cleanup logic if needed
    }
}
// ============================================================================
// MAIN APPLICATION
// ============================================================================
async function main() {
    try {
        const weatherServer = new WeatherMCPServer();
        await weatherServer.start();
    }
    catch (error) {
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
