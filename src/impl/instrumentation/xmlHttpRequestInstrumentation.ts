import * as api from '@opentelemetry/api';
import {
  XMLHttpRequestInstrumentation,
  XMLHttpRequestInstrumentationConfig
} from '@opentelemetry/instrumentation-xml-http-request';
import { addUrlParams } from './urlParams';
import { RequestParameterConfig } from '../../types';

type ExposedXHRSuper = {
  _createSpan(xhr: XMLHttpRequest, url: string, method: string): api.Span | undefined;
}

export class CustomXMLHttpRequestInstrumentation extends XMLHttpRequestInstrumentation {

  private readonly excludeUrlKeys: string[] = [];

  constructor(config: XMLHttpRequestInstrumentationConfig = {}, requestParameterConfig: RequestParameterConfig) {
    super(config);

    if(requestParameterConfig.enabled)
      this.excludeUrlKeys = requestParameterConfig.excludeKeys;

    //Store original function in variable
    const exposedSuper = this as any as ExposedXHRSuper;
    const _superStartSpan: ExposedXHRSuper['_createSpan'] = exposedSuper._createSpan.bind(this);

    //Override function
    exposedSuper._createSpan = (xhr, url, method) => {
      const span = _superStartSpan(xhr, url, method);
      addUrlParams(span, url, this.excludeUrlKeys);

      return span;
    }
  }
}




