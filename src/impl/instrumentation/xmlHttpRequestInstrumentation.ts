import { InstrumentationConfig } from '@opentelemetry/instrumentation';
import * as api from '@opentelemetry/api';
import {
  XMLHttpRequestInstrumentation,
  XMLHttpRequestInstrumentationConfig
} from '@opentelemetry/instrumentation-xml-http-request';
import { Span } from '@opentelemetry/api';


type ExposedXHRSuper = {
  _createSpan(xhr: XMLHttpRequest, url: string, method: string): api.Span | undefined;
}

export class CustomXMLHttpRequestInstrumentation extends XMLHttpRequestInstrumentation {

  constructor(config: XMLHttpRequestInstrumentationConfig & InstrumentationConfig = {}) {
    super(config);

    const exposedSuper = this as any as ExposedXHRSuper;
    const _superStartSpan: ExposedXHRSuper['_createSpan'] = exposedSuper._createSpan.bind(this);

    exposedSuper._createSpan = (xhr, url, method) => {
      const span = _superStartSpan(xhr, url, method);

      this.addUrlParamsToSpan(span, url);

      return span;
    }
  }

  private addUrlParamsToSpan(span: Span, url: string){
    const urlParams = url.split("?")[1];

    if(urlParams) {
      const keyValuePairs = urlParams.split("&");
      for(const keyValue of keyValuePairs) {
        const [key, value] = keyValue.split("=");
        span.setAttribute(key, value);
      }
    }
  }
}




