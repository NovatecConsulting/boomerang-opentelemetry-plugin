import * as api from '@opentelemetry/api';
import { addUrlParams } from './urlParams';
import { FetchInstrumentation, FetchInstrumentationConfig } from '@opentelemetry/instrumentation-fetch';
import { GlobalInstrumentationConfig, RequestParameterConfig } from '../../types';
import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';

type ExposedUserInteractionSuper = {
  _createSpan(element: EventTarget | null | undefined, eventName: string, parentSpan?: api.Span | undefined): api.Span | undefined;
}

export class CustomUserInteractionInstrumentation extends UserInteractionInstrumentation {

  constructor(config: InstrumentationConfig = {}, globalInstrumentationConfig: GlobalInstrumentationConfig) {
    super(config);
    const { requestParameter} = globalInstrumentationConfig;

    //Store original function in variable
    const exposedSuper = this as any as ExposedUserInteractionSuper;
    const _superCreateSpan: ExposedUserInteractionSuper['_createSpan'] = exposedSuper._createSpan.bind(this);

    //Override function
    exposedSuper._createSpan = (element, eventName, parentSpan) => {
      const span = _superCreateSpan(element, eventName, parentSpan);

      if(span && requestParameter?.enabled) {
        if(requestParameter.excludeKeysFromBeacons) addUrlParams(span, location.href, requestParameter.excludeKeysFromBeacons);
        else addUrlParams(span, location.href);
      }

      return span;
    }
  }
}




