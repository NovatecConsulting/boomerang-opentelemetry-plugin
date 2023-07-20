import { Context } from '@opentelemetry/api';
import { Span, ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base';

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
 */
export class MultiSpanProcessor implements SpanProcessor {

  private readonly spanProcessors: SpanProcessor[];
  constructor(spanProcessors: SpanProcessor[]) {
    this.spanProcessors = spanProcessors;
  }

  forceFlush(): Promise<void> {
    return Promise.all(
      this.spanProcessors.map((processor) => {
        if (processor.forceFlush) {
          return processor.forceFlush();
        }
        return Promise.resolve();
      })
    ).then(() => {});
  }

  onEnd(span: ReadableSpan): void {
    for (const processor of this.spanProcessors) {
      processor.onEnd(span);
    }
  }

  onStart(span: Span, parentContext: Context): void {
    for (const processor of this.spanProcessors) {
      processor.onStart(span, parentContext);
    }
  }

  shutdown(): Promise<void> {
    return Promise.all(
      this.spanProcessors.map((processor) => processor.shutdown())
    ).then(() => {});
  }
}

