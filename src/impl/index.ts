import { ZoneContextManager } from '@opentelemetry/context-zone';
import { ALWAYS_SAMPLER, B3Propagator, NEVER_SAMPLER, ProbabilitySampler } from '@opentelemetry/core';
import { CollectorExporter, CollectorExporterConfig } from '@opentelemetry/exporter-collector';
import { XMLHttpRequestPlugin } from '@opentelemetry/plugin-xml-http-request';
import { PropagateTraceHeaderCorsUrls } from '@opentelemetry/plugin-xml-http-request/build/src/types';
import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/tracing';
import { WebTracerProvider } from '@opentelemetry/web';

export interface TracingProperties {
  samplingRate: number;
  corsUrls: PropagateTraceHeaderCorsUrls;
  collectorConfiguration: CollectorExporterConfig | undefined;
  consoleOnly: boolean;
}

/**
 * TODOs:
 * - other provider config options via props
 * - allow propagator definition via props
 */
export default class OpenTelemetryTracingImpl {
  private props: TracingProperties;
  private beaconUrl: string;
  private initialized: boolean;

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
    if (this.initialized) {
      return;
    }

    // provider with the only one available plugin for now
    const provider = new WebTracerProvider({
      sampler: this.resolveSampler(),
      plugins: [
        new XMLHttpRequestPlugin({
          propagateTraceHeaderCorsUrls: this.props.corsUrls,
        }),
      ],
    });

    // if we have any exporter available, then any of them, otherwise use the console logger
    if (!this.props.consoleOnly) {
      // jaeger exporter
      provider.addSpanProcessor(
        new SimpleSpanProcessor(
          new CollectorExporter({
            url: this.collectorUrlFromBeaconUrl(),
            ...this.props.collectorConfiguration,
          })
        )
      );
    } else {
      provider.addSpanProcessor(
        new SimpleSpanProcessor(new ConsoleSpanExporter())
      );
    }

    // register and set as initalized
    provider.register({
      contextManager: new ZoneContextManager(),
      propagator: new B3Propagator(),
    });
    this.initialized = true;
  };

  public isInitalized = () => this.initialized;

  public getProps = () => this.props;

  public setBeaconUrl = (url: string) => (this.beaconUrl = url);

  private collectorUrlFromBeaconUrl = () => {
    if (this.beaconUrl) {
      const indexOf = this.beaconUrl.lastIndexOf('/beacon');
      if (indexOf !== -1) {
        return `${this.beaconUrl.substring(0, indexOf)}/spans`;
      }
    }
    return this.beaconUrl;
  };

  private resolveSampler = () => {
    const { samplingRate } = this.props;

    // if not [0, 1] then failback to default
    if (samplingRate === 0) {
      return NEVER_SAMPLER;
    } else if (samplingRate === 1) {
      return ALWAYS_SAMPLER;
    } else if (samplingRate > 0 && samplingRate < 1) {
      return new ProbabilitySampler(samplingRate);
    }
  };

}
