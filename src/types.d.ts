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
    instrument_document_load: boolean;
    instrument_user_interaction: boolean;
}

export type ContextFunction = () => void;