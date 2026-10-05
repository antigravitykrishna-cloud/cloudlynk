import { decodeBase64 } from '@/utils/base64';

const bytes = (text: string) => Array.from(text, c => c.charCodeAt(0));

describe('decodeBase64', () => {
  it('decodes without padding', () => {
    expect(Array.from(decodeBase64('Q2xvdWQ='))).toEqual(bytes('Cloud'));
    expect(Array.from(decodeBase64('bHlua3M='))).toEqual(bytes('lynks'));
    expect(Array.from(decodeBase64('YWJj'))).toEqual(bytes('abc'));
  });

  it('honours one and two padding characters', () => {
    expect(Array.from(decodeBase64('YWI='))).toEqual(bytes('ab'));
    expect(Array.from(decodeBase64('YQ=='))).toEqual(bytes('a'));
  });

  it('round-trips arbitrary bytes', () => {
    const original = [0, 255, 16, 128, 7, 64, 200];
    const encoded = Buffer.from(original).toString('base64');
    expect(Array.from(decodeBase64(encoded))).toEqual(original);
  });
});
