import { Context } from '@opentelemetry/api';
import { Span, ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { globalErrorHandler } from '@opentelemetry/core';

/**
 * SpanProcessor for special operations
 */
export class CustomSpanProcessor implements SpanProcessor {

  /**
   * Map of custom attributes that should be added to all spans
   */
  private customAttributes:Map<string,string>;

  constructor() {
    this.customAttributes = new Map<string, string>();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  onEnd(span: ReadableSpan): void {
    // No operation necessary
  }

  onStart(span: Span, parentContext: Context): void {
    if(this.customAttributes.size > 0) {
      this.customAttributes.forEach(
        // For some reason forEach() twists key and value
        (value:string, key:string) => span.setAttribute(key,value)
      )
    }
  }

  shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }

  public addCustomAttribute(key:string, value:string) {
    this.customAttributes.set(key, value);
  }
}

/**
 * Storage to allow the use of multiple SpanProcessors
 * Copy of MultiSpanProcessor from @opentelemetry/sdk-trace-base, which cannot be imported for unknown reason
 * Original: https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-sdk-trace-base/src/MultiSpanProcessor.ts
 */
export class MultiSpanProcessor implements SpanProcessor {
  constructor(private readonly _spanProcessors: SpanProcessor[]) {}

  forceFlush(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const spanProcessor of this._spanProcessors) {
      promises.push(spanProcessor.forceFlush());
    }
    return new Promise(resolve => {
      Promise.all(promises)
        .then(() => {
          resolve();
        })
        .catch(error => {
          globalErrorHandler(
            error || new Error('MultiSpanProcessor: forceFlush failed')
          );
          resolve();
        });
    });
  }

  onStart(span: Span, context: Context): void {
    for (const spanProcessor of this._spanProcessors) {
      spanProcessor.onStart(span, context);
    }
  }

  onEnd(span: ReadableSpan): void {
    for (const spanProcessor of this._spanProcessors) {
      spanProcessor.onEnd(span);
    }
  }

  shutdown(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const spanProcessor of this._spanProcessors) {
      promises.push(spanProcessor.shutdown());
    }
    return new Promise((resolve, reject) => {
      Promise.all(promises).then(() => {
        resolve();
      }, reject);
    });
  }
}

