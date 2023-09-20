import * as api from '@opentelemetry/api';
import {
  XMLHttpRequestInstrumentation,
  XMLHttpRequestInstrumentationConfig
} from '@opentelemetry/instrumentation-xml-http-request';
import { Span } from '@opentelemetry/api';
import { addUrlParams } from './urlParams';

export interface CustomXMLHttpRequestInstrumentationConfig extends XMLHttpRequestInstrumentationConfig {
  excludeParameterKeys?: string[];
}

type ExposedXHRSuper = {
  _createSpan(xhr: XMLHttpRequest, url: string, method: string): api.Span | undefined;
}

export class CustomXMLHttpRequestInstrumentation extends XMLHttpRequestInstrumentation {

  private readonly excludeKeys: string[] = [];

  constructor(config: CustomXMLHttpRequestInstrumentationConfig = {}) {
    super(config);
    this.excludeKeys = config.excludeParameterKeys;

    const exposedSuper = this as any as ExposedXHRSuper;
    const _superStartSpan: ExposedXHRSuper['_createSpan'] = exposedSuper._createSpan.bind(this);

    exposedSuper._createSpan = (xhr, url, method) => {
      const span = _superStartSpan(xhr, url, method);

      addUrlParams(span, url, this.excludeKeys);

      return span;
    }
  }
}




