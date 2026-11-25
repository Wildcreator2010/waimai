import { toCsv } from './csv';

describe('CSV 导出', () => {
  it('普通字段按逗号拼接并补行尾', () => {
    const csv = toCsv(['a', 'b'], [
      [1, 'x'],
      [2, 'y'],
    ]);
    expect(csv).toBe('a,b\r\n1,x\r\n2,y\r\n');
  });

  it('含逗号/引号/换行的字段会被正确转义', () => {
    const csv = toCsv(['note'], [['a,b'], ['say "hi"'], ['line1\nline2']]);
    expect(csv).toContain('"a,b"');
    expect(csv).toContain('"say ""hi"""');
    expect(csv).toContain('"line1\nline2"');
  });

  it('null/undefined 输出空串，日期转 UTC 文本', () => {
    const csv = toCsv(['x', 'y', 'z'], [[null, undefined, new Date('2026-11-14T00:00:00Z')]]);
    expect(csv).toBe('x,y,z\r\n,,2026-11-14 00:00:00\r\n');
  });

  it('布尔与数字按原样输出', () => {
    expect(toCsv(['a', 'b'], [[true, 0]])).toBe('a,b\r\ntrue,0\r\n');
  });
});
