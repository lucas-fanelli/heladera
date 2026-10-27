/* Setup para tests de componentes (jsdom). */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { resetTiming } from '@/domain/timing';

declare global {
  interface Window { __TIMING_SCALE__?: number; __MOTION_SCALE__?: number }
}

export function mockMatchMedia(matches: Record<string, boolean> = {}) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: !!matches[q], media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
export function setOnLine(v: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: v, configurable: true });
  window.dispatchEvent(new Event(v ? 'online' : 'offline'));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.__MOTION_SCALE__ = 0;   // Motion instantáneo
  window.__TIMING_SCALE__ = 1;   // los tests de timers usan fake timers y avanzan a mano
  resetTiming();
  mockMatchMedia();
  setOnLine(true);
  // jsdom no implementa visualViewport ni ResizeObserver: los componentes hacen feature-detect
  (window as unknown as { visualViewport?: unknown }).visualViewport = undefined;
  if (!('ResizeObserver' in window)) {
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
  }
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!('animate' in Element.prototype)) {
    (Element.prototype as unknown as { animate: unknown }).animate = () => ({ finished: Promise.resolve(), cancel() {}, play() {}, pause() {}, finish() {}, onfinish: null });
  }
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
