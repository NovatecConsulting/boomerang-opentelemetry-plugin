import { context, setSpan, Span } from '@opentelemetry/api';
import { AlwaysOnSampler, AlwaysOffSampler, TraceIdRatioBasedSampler } from '@opentelemetry/core';
import { WebTracerProvider } from '@opentelemetry/web';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { CollectorTraceExporter, CollectorExporterNodeConfigBase } from '@opentelemetry/exporter-collector';
import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/tracing';
import { B3Propagator } from '@opentelemetry/propagator-b3';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { PluginProperties, ContextFunction } from '../types';

/**
 * TODOs:
 * - other provider config options via props
 * - allow propagator definition via props
 */
export default class OpenTelemetryTracingImpl {

  private props: PluginProperties;

  private beaconUrl: string;

  private initialized: boolean;

  private traceProvider: WebTracerProvider;

  constructor() {
    // set default properties
    this.props = {
      samplingRate: 1,
      corsUrls: [],
      collectorConfiguration: undefined,
      consoleOnly: false,
    };
    this.initialized = false;
  }

  public register = () => {
    // return if already initialized
    if (this.initialized) {
      return;
    }

    // create provider
    const providerWithZone = new WebTracerProvider({
      sampler: this.resolveSampler()
    });

    providerWithZone.register({
      // changing default contextManager to use ZoneContextManager - supports asynchronous operations
      contextManager: new ZoneContextManager(),
      // using B3 context propagation format
      propagator: new B3Propagator(),
    });

    // registering instrumentations / plugins
    registerInstrumentations({
      instrumentations: [
        // XMLHttpRequest Instrumentation for web plugin
        new XMLHttpRequestInstrumentation({
          propagateTraceHeaderCorsUrls: this.props.corsUrls,
        }),
      ],
      // @ts-ignore - has to be clearified why typescript doesn't like this line
      tracerProvider: providerWithZone,
    });

    // use OT collector if logging to console is not enabled
    if (!this.props.consoleOnly) {
      // register opentelemetry collector exporter
      const collectorOptions: CollectorExporterNodeConfigBase = {
        url: this.collectorUrlFromBeaconUrl(),
        headers: {}, // an optional object containing custom headers to be sent with each request
        concurrencyLimit: 10, // an optional limit on pending requests
        ...this.props.collectorConfiguration,
      };

      const exporter = new CollectorTraceExporter(collectorOptions);
      providerWithZone.addSpanProcessor(new SimpleSpanProcessor(exporter));
    } else {
      // register console exporter for logging all recorded traces to the console
      providerWithZone.addSpanProcessor(
        new SimpleSpanProcessor(new ConsoleSpanExporter())
      );
    }

    // store the webtracer
    this.traceProvider = providerWithZone;

    // mark plugin initalized
    this.initialized = true;
  };

  public isInitalized = () => this.initialized;

  public getProps = () => this.props;

  public setBeaconUrl = (url: string) => (this.beaconUrl = url);

  public getTracer = (name: string, version?: string) => {
    return this.traceProvider.getTracer(name, version);
  }

  withSpan = (span: Span, fn: ContextFunction) => {
    context.with(setSpan(context.active(), span), fn);
  };

  private collectorUrlFromBeaconUrl = () => {
    if (this.beaconUrl) {
      const indexOf = this.beaconUrl.lastIndexOf('/beacon');
      if (indexOf !== -1) {
        return `${this.beaconUrl.substring(0, indexOf)}/spans`;
      }
    }
    return undefined;
  };

  private resolveSampler = () => {
    const { samplingRate } = this.props;

    // if not [0, 1] then failback to default
    if (samplingRate < 0) {
      return new AlwaysOffSampler();
    } else if (samplingRate > 1) {
      return new AlwaysOnSampler();
    } else {
      return new TraceIdRatioBasedSampler(samplingRate);
    }
  };
}
