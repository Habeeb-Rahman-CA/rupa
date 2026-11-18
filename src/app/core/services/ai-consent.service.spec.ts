import { TestBed } from '@angular/core/testing';
import { AiConsentService } from './ai-consent.service';

const KEY = 'rupa:ai_scan_consent';

describe('AiConsentService', () => {
  beforeEach(() => {
    localStorage.removeItem(KEY);
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    localStorage.removeItem(KEY);
  });

  it('starts with no consent (scanning blocked)', () => {
    const svc = TestBed.inject(AiConsentService);
    expect(svc.state()).toBe('unknown');
    expect(svc.granted()).toBeFalse();
  });

  it('grants consent and persists the choice', () => {
    const svc = TestBed.inject(AiConsentService);
    svc.grant();
    expect(svc.state()).toBe('granted');
    expect(svc.granted()).toBeTrue();
    expect(localStorage.getItem(KEY)).toBe('granted');
  });

  it('records a denial and keeps scanning blocked', () => {
    const svc = TestBed.inject(AiConsentService);
    svc.deny();
    expect(svc.state()).toBe('denied');
    expect(svc.granted()).toBeFalse();
    expect(localStorage.getItem(KEY)).toBe('denied');
  });

  it('restores a previously granted choice on load', () => {
    localStorage.setItem(KEY, 'granted');
    const svc = TestBed.inject(AiConsentService);
    expect(svc.granted()).toBeTrue();
  });

  it('restores a previously denied choice on load', () => {
    localStorage.setItem(KEY, 'denied');
    const svc = TestBed.inject(AiConsentService);
    expect(svc.state()).toBe('denied');
    expect(svc.granted()).toBeFalse();
  });

  it('treats an unrecognized stored value as no consent', () => {
    localStorage.setItem(KEY, 'not-a-real-value');
    const svc = TestBed.inject(AiConsentService);
    expect(svc.state()).toBe('unknown');
    expect(svc.granted()).toBeFalse();
  });
});
