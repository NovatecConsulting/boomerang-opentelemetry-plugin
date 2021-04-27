import { PropagateTraceHeaderCorsUrls } from "@opentelemetry/web";
import { CollectorExporterNodeConfigBase } from "@opentelemetry/exporter-collector";

export interface PluginProperties {
    samplingRate: number;
    corsUrls: PropagateTraceHeaderCorsUrls;
    collectorConfiguration: CollectorExporterNodeConfigBase | undefined;
    consoleOnly: boolean;
    plugins: OTPluginProperties;
}

export interface OTPluginProperties {
    instrument_fetch: boolean;
    instrument_xhr: boolean;
}

export type ContextFunction = () => void;