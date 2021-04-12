import { PropagateTraceHeaderCorsUrls } from "@opentelemetry/web";
import { CollectorExporterNodeConfigBase } from "@opentelemetry/exporter-collector";

export interface PluginProperties {
    samplingRate: number;
    corsUrls: PropagateTraceHeaderCorsUrls;
    collectorConfiguration: CollectorExporterNodeConfigBase | undefined;
    consoleOnly: boolean;
}

export type ContextFunction = () => void;