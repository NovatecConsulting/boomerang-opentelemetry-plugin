import api, { context, trace, Span } from '@opentelemetry/api';
import {
  AlwaysOnSampler,
  AlwaysOffSampler,
  TraceIdRatioBasedSampler,
  HttpTraceContextPropagator,
} from '@opentelemetry/core';
import {
  WebTracerConfig,
  WebTracerProvider,
} from '@opentelemetry/sdk-trace-web';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { ZoneContextManager } from '@opentelemetry/context-zone-peer-dep';
import {
  CollectorTraceExporter,
  CollectorExporterNodeConfigBase,
} from '@opentelemetry/exporter-collector';
import {
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  BatchSpanProcessor,
  Tracer,
} from '@opentelemetry/sdk-trace-base';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { B3InjectEncoding, B3Propagator } from '@opentelemetry/propagator-b3';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';
import { PluginProperties, ContextFunction, PropagationHeader } from '../types';
import { patchExporter, patchExporterClass } from './patchCollectorPrototype';
import { MultiSpanProcessor, CustomSpanProcessor } from './spanProcessing';
import { DocumentLoadServerTimingInstrumentation, patchTracer } from './instrumentation/documentLoadInstrumentation';
import { CustomIdGenerator } from './transaction/transactionIdGeneration';
import { TransactionSpanManager } from './transaction/transactionSpanManager';

/**
 * TODOs:
 * - other provider config options via props
 * - allow propagator definition via props
 */
export default class OpenTelemetryTracingImpl {
  private defaultProperties: PluginProperties = {
    samplingRate: 1,
    corsUrls: [],
    collectorConfiguration: undefined,
    consoleOnly: false,
    plugins: {
      instrument_fetch: true,
      instrument_xhr: true,
      instrument_document_load: true,
      instrument_user_interaction: true,
    },
    plugins_config: {
      instrument_fetch: {
        enabled: false,
        clearTimingResources: false,
        path: "",
        applyCustomAttributesOnSpan: null, //(span: Span, request: Request) => { },
        ignoreUrls: [],
        propagateTraceHeaderCorsUrls: []
      },
      instrument_xhr: {
        enabled: false,
        path: "",
        applyCustomAttributesOnSpan: null, // (span: Span, xhr: XMLHttpRequest) => { },
        propagateTraceHeaderCorsUrls: [],
        ignoreUrls: [],
        clearTimingResources: false,
      },
      instrument_document_load: {
        enabled: false,
        path: "",
        recordTransaction: false,
        exporterDelay: 20
      },
      instrument_user_interaction: {
        enabled: false,
        path: "",
      },
    },
    exporter: {
      maxQueueSize: 100,
      maxExportBatchSize: 10,
      scheduledDelayMillis: 500,
      exportTimeoutMillis: 30000,
    },
    commonAttributes: {},
    prototypeExporterPatch: false,
    serviceName: undefined,
    propagationHeader: PropagationHeader.TRACE_CONTEXT,
  };

  private props: PluginProperties = {
    ...this.defaultProperties,
  };

  private initialized: boolean = false;

  /** Boomerangs configured beacon_url. */
  private beaconUrl: string;

  private traceProvider: WebTracerProvider;

  private customSpanProcessor = new CustomSpanProcessor();
  private customIdGenerator = new CustomIdGenerator();

  public register = () => {
    // return if already initialized
    if (this.initialized) {
      return;
    }

    // instrument the tracer class for injecting default attributes
    this.instrumentTracerClass();

    // the configuration used by the tracer
    const tracerConfiguration: WebTracerConfig = {
      sampler: this.resolveSampler(),
      idGenerator: this.customIdGenerator
    };

    // create provider
    const providerWithZone = new WebTracerProvider(tracerConfiguration);

    providerWithZone.register({
      // changing default contextManager to use ZoneContextManager - supports asynchronous operations
      contextManager: new ZoneContextManager(),
      // using B3 context propagation format
      propagator: this.getContextPropagator(),
    });

    // registering instrumentations / plugins
    registerInstrumentations({
      instrumentations: this.getInstrumentationPlugins(),
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

      // patches the collector-export in order to be compatible with Prototype
      if (this.props.prototypeExporterPatch) {
        patchExporter(exporter);
        patchExporterClass();
      }

      const batchSpanProcessor = new BatchSpanProcessor(exporter, {
        ...this.defaultProperties.exporter,
        ...this.props.exporter,
      });

      const multiSpanProcessor = new MultiSpanProcessor([batchSpanProcessor, this.customSpanProcessor]);

      providerWithZone.addSpanProcessor(
        multiSpanProcessor
      );
    } else {
      // register console exporter for logging all recorded traces to the console
      providerWithZone.addSpanProcessor(
        new SimpleSpanProcessor(new ConsoleSpanExporter())
      );
    }

    // store the webtracer
    this.traceProvider = providerWithZone;

    // If recordTransaction is enabled, patch the Tracer to always use the transaction span as root span
    // and initialize the transaction data storage
    if(this.isTransactionRecordingEnabled()) {
      patchTracer();
      const delay = this.props.plugins_config?.instrument_document_load?.exporterDelay;
      TransactionSpanManager.initialize(true, this.customIdGenerator);

      window.addEventListener("beforeunload", (event) => {
        TransactionSpanManager.getTransactionSpan().end();
        this.traceProvider.forceFlush();
        //Synchronous blocking is necessary, so the span can be exported successfully
        this.sleep(delay);
      });
    }

    // mark plugin initalized
    this.initialized = true;
  };

  public isInitalized = () => this.initialized;

  public getProps = () => this.props;

  public getOpenTelemetryApi = () => {
    return api;
  };

  public addVarToSpans = (key: string, value: string) => {
    // Add Variable to active span
    let activeSpan = api.trace.getSpan(api.context.active());
    if(activeSpan != undefined) activeSpan.setAttribute(key, value);
    // And to all following spans
    this.customSpanProcessor.addCustomAttribute(key,value);
  }

  public startNewTransaction = (spanName: string) => {
    TransactionSpanManager.startNewTransaction(spanName);
  }

  public setBeaconUrl = (url: string) => {
    this.beaconUrl = url;
  };

  private isTransactionRecordingEnabled = (): boolean => {
    return this.props.plugins_config?.instrument_document_load?.recordTransaction;
  }

  private sleep = (delay: number) => {
    //Use 20 ms as default
    if(!delay) delay = 20;

    const start = new Date().getTime();
    while (new Date().getTime() < start + delay);
  }

  /**
   * @returns Returns the configured context propagator for injecting the trace context into HTTP request headers.
   */
  private getContextPropagator = () => {
    switch (this.props.propagationHeader) {
      case PropagationHeader.B3_SINGLE:
        return new B3Propagator({
          injectEncoding: B3InjectEncoding.SINGLE_HEADER,
        });
      case PropagationHeader.B3_MULTI:
        return new B3Propagator({
          injectEncoding: B3InjectEncoding.MULTI_HEADER,
        });
      case PropagationHeader.TRACE_CONTEXT:
      default:
        return new HttpTraceContextPropagator();
    }
  };

  /**
   * Patching the tracer class for injecting additional data into spans.
   */
  private instrumentTracerClass = () => {
    const { commonAttributes, serviceName } = this.props;
    // don't patch the function if no attributes are defined
    if (Object.keys(commonAttributes).length <= 0) {
      return;
    }

    const originalStartSpanFunction = Tracer.prototype.startSpan;

    Tracer.prototype.startSpan = function () {
      const span: Span = originalStartSpanFunction.apply(this, arguments);

      // add common attributes to each span
      if (commonAttributes) {
        span.setAttributes(commonAttributes);
      }

      // manually set the service name. This is done because otherwise the service name
      // has to specified when the tracer is initialized and at this time, the service name
      // might not be set, yet (e.g. when using Boomerang Vars).
      const resource: Resource = (<any>span).resource;
      if (resource) {
        (<any>span).resource = resource.merge(
          new Resource({
            [SemanticResourceAttributes.SERVICE_NAME]:
              serviceName instanceof Function ? serviceName() : serviceName,
          })
        );
      }
      return span;
    };
  };

  /**
   * Returns a tracer instance from the used OpenTelemetry SDK.
   */
  public getTracer = (name: string, version?: string) => {
    return this.traceProvider.getTracer(name, version);
  };

  /**
   * Convenient function for executing a functions in the context of
   * a specified span.
   */
  public withSpan = (span: Span, fn: ContextFunction) => {
    context.with(trace.setSpan(context.active(), span), fn);
  };

  private getInstrumentationPlugins = () => {
    const { plugins, corsUrls, plugins_config } = this.props;
    const instrumentations: any = [];

    // Instrumentation for the document on load (initial request)
    if (plugins_config?.instrument_document_load?.enabled !== false) {
      if(this.isTransactionRecordingEnabled())
        instrumentations.push(new DocumentLoadServerTimingInstrumentation(plugins_config.instrument_document_load));
      else
        instrumentations.push(new DocumentLoadInstrumentation(plugins_config.instrument_document_load));
    }
    else if (plugins?.instrument_document_load !== false) {
      instrumentations.push(new DocumentLoadInstrumentation());
    }

    // Instrumentation for user interactions
    if (plugins_config?.instrument_user_interaction?.enabled !== false) {
      instrumentations.push(new UserInteractionInstrumentation(plugins_config.instrument_user_interaction));
    }
    else if (plugins?.instrument_user_interaction !== false) {
      instrumentations.push(new UserInteractionInstrumentation());
    }

    // XMLHttpRequest Instrumentation for web plugin
    if (plugins_config?.instrument_xhr?.enabled !== false) {
      instrumentations.push(new XMLHttpRequestInstrumentation(plugins_config.instrument_xhr));
    } else if (plugins?.instrument_xhr !== false) {
      instrumentations.push(
        new XMLHttpRequestInstrumentation({
          propagateTraceHeaderCorsUrls: corsUrls
        })
      );
    }

    // Instrumentation for the fetch API if available
    const isFetchAPISupported = 'fetch' in window;
    if (isFetchAPISupported && plugins_config?.instrument_fetch?.enabled !== false) {
      instrumentations.push(new FetchInstrumentation(plugins_config.instrument_fetch));
    }
    else if (isFetchAPISupported && plugins?.instrument_fetch !== false) {
      instrumentations.push(new FetchInstrumentation());
    }

    return instrumentations;
  };

  /**
   * Derives the collector Url based on the beacon one.
   */
  private collectorUrlFromBeaconUrl = () => {
    if (this.beaconUrl) {
      const indexOf = this.beaconUrl.lastIndexOf('/beacon');
      if (indexOf !== -1) {
        return `${this.beaconUrl.substring(0, indexOf)}/spans`;
      }
    }
    return undefined;
  };

  /**
   * Resolves a sampler implementation based on the specified sample rate.
   */
  private resolveSampler = () => {
    const { samplingRate } = this.props;

    if (samplingRate < 0) {
      return new AlwaysOffSampler();
    } else if (samplingRate > 1) {
      return new AlwaysOnSampler();
    } else {
      return new TraceIdRatioBasedSampler(samplingRate);
    }
  };
}
