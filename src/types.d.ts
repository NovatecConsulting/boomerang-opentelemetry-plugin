import { PropagateTraceHeaderCorsUrls } from '@opentelemetry/sdk-trace-web';
import { OTLPExporterNodeConfigBase } from '@opentelemetry/otlp-exporter-base';
import { CustomDocumentLoadInstrumentationConfig } from './impl/instrumentation/documentLoadInstrumentation';
import { FetchInstrumentationConfig } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentationConfig } from '@opentelemetry/instrumentation-xml-http-request';
import { UserInteractionInstrumentationConfig } from '@opentelemetry/instrumentation-user-interaction';

export interface PluginProperties {
  samplingRate: number;
  corsUrls: PropagateTraceHeaderCorsUrls;
  collectorConfiguration: OTLPExporterNodeConfigBase | undefined;
  consoleOnly: boolean;
  plugins: OTPluginProperties;
  plugins_config: OTPluginConfig;
  global_instrumentation: GlobalInstrumentationConfig;
  exporter: OTExportProperties;
  commonAttributes: StringMap;
  serviceName: string | (() => string);
  propagationHeader: PropagationHeader;
  prototypeExporterPatch: boolean;
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
  browser_detector: boolean;
}

export interface OTPluginConfig {
  instrument_fetch: FetchInstrumentationConfig;
  instrument_xhr: XMLHttpRequestInstrumentationConfig;
  instrument_document_load: CustomDocumentLoadInstrumentationConfig;
  instrument_user_interaction: UserInteractionInstrumentationConfig;
}

export interface GlobalInstrumentationConfig {
  requestParameter: RequestParameterConfig;
}

export interface RequestParameterConfig {
  enabled?: boolean;
  excludeKeysFromBeacons: string[];
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
