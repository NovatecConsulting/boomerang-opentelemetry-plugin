import { PropagateTraceHeaderCorsUrls } from '@opentelemetry/sdk-trace-web';
import { CollectorExporterNodeConfigBase } from '@opentelemetry/exporter-collector';
import { DocumentLoadServerTimingInstrumentationConfig } from './impl/instrumentation/documentLoadInstrumentation';
import { InstrumentationConfig } from "@opentelemetry/instrumentation";
import { CustomXMLHttpRequestInstrumentationConfig } from './impl/instrumentation/xmlHttpRequestInstrumentation';
import { CustomFetchInstrumentationConfig } from './impl/instrumentation/fetchInstrumentation';

export interface PluginProperties {
  samplingRate: number;
  corsUrls: PropagateTraceHeaderCorsUrls;
  collectorConfiguration: CollectorExporterNodeConfigBase | undefined;
  consoleOnly: boolean;
  plugins: OTPluginProperties;
  plugins_config: OTPluginConfig;
  exporter: OTExportProperties;
  commonAttributes: StringMap;
  prototypeExporterPatch: boolean;
  serviceName: string | (() => string);
  propagationHeader: PropagationHeader;
}

export const enum PropagationHeader {
  B3_SINGLE = 'B3_SINGLE',
  B3_MULTI = 'B3_MULTI',
  TRACE_CONTEXT = 'TRACE_CONTEXT',
}

export interface StringMap {
  [key: string]: string;
}

export interface OTPluginProperties {
  instrument_fetch: boolean;
  instrument_xhr: boolean;
  instrument_document_load: boolean;
  instrument_user_interaction: boolean;
}

export interface OTPluginConfig {
  instrument_fetch: CustomFetchInstrumentationConfig;
  instrument_xhr: CustomXMLHttpRequestInstrumentationConfig;
  instrument_document_load: DocumentLoadServerTimingInstrumentationConfig;
  instrument_user_interaction: InstrumentationConfig;
}

export interface OTExportProperties {
  // The maximum queue size. After the size is reached spans are dropped.
  maxQueueSize: number;
  // The maximum batch size of every export. It must be smaller or equal to maxQueueSize.
  maxExportBatchSize: number;
  // The interval between two consecutive exports
  scheduledDelayMillis: number;
  // How long the export can run before it is cancelled
  exportTimeoutMillis: number;
}

export type ContextFunction = () => void;
