import * as api from '@opentelemetry/api';
import { addUrlParams } from './urlParams';
import { FetchInstrumentation, FetchInstrumentationConfig } from '@opentelemetry/instrumentation-fetch';
import { RequestParameterConfig } from '../../types';
import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';

type ExposedUserInteractionSuper = {
  _createSpan(element: EventTarget | null | undefined, eventName: string, parentSpan?: api.Span | undefined): api.Span | undefined;
}

export class CustomUserInteractionInstrumentation extends UserInteractionInstrumentation {

  private readonly excludeUrlKeys: string[] = [];

  constructor(config: InstrumentationConfig = {}, requestParameterConfig: RequestParameterConfig) {
    super(config);

    if(requestParameterConfig.enabled)
      this.excludeUrlKeys = requestParameterConfig.excludeKeys;

    //Store original function in variable
    const exposedSuper = this as any as ExposedUserInteractionSuper;
    const _superStartSpan: ExposedUserInteractionSuper['_createSpan'] = exposedSuper._createSpan.bind(this);

    //Override function
    exposedSuper._createSpan = (element, eventName, parentSpan) => {
      const span = _superStartSpan(element, eventName, parentSpan);
      addUrlParams(span, location.href, this.excludeUrlKeys);

      return span;
    }
  }
}




