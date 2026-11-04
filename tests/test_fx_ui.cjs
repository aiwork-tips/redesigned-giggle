// Functional tests for FX lifecycle; runs entirely offline in GitHub Actions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
const begin = html.indexOf('let fxRequestVersion=0,fxManual=false,fxTimer=null;');
const end = html.indexOf('async function checkEbayFeed(){', begin);
assert(begin >= 0 && end > begin, 'FX logic missing');
const source = html.slice(begin, end);

function harness({cached, fetcher} = {}) {
  const els = Object.create(null), listeners = Object.create(null), data = new Map();
  if (cached) data.set('export-scout-fx-usdjpy-v1', JSON.stringify(cached));
  let fetchCalls = 0, timerId = 0;
  const $ = id => {
    if (!els[id]) els[id] = {
      value: '', textContent: '', disabled: false,
      addEventListener(event, fn) { listeners[id + ':' + event] = fn; }
    };
    return els[id];
  };
  const context = {
    $, fxKey: 'export-scout-fx-usdjpy-v1',
    Date, Number, Intl, AbortController,
    setTimeout() { return ++timerId; }, clearTimeout() {},
    setInterval() { return ++timerId; },
    document: {addEventListener() {}, visibilityState: 'visible'},
    localStorage: {getItem: k => data.get(k) || null, setItem: (k, v) => data.set(k,v)},
    updateUSD() {}, syncQuick() {},
    async fetch(...args) {
      fetchCalls++;
      return fetcher ? fetcher(...args) : {ok: true, async json() {return sample()}};
    },
  };
  vm.runInNewContext(source + '\nthis.__testFX = {fetchFX,fxCacheRead};', context);
  return {els, listeners, data, get calls() {return fetchCalls;}, ...context.__testFX, $};
}

function sample() {
  const now = Date.now();
  return {
    result: 'success', base_code: 'USD',
    rates: {JPY: 153.241},
    time_last_update_utc: new Date(now - 9 * 3600000).toUTCString(),
    time_next_update_utc: new Date(now + 15 * 3600000).toUTCString(),
  };
}
function cached() {
  const p = sample();
  return {rate:p.rates.JPY, sourceTime:p.time_last_update_utc,
    nextUpdate:p.time_next_update_utc, at:Date.now() - 60000};
}

(async () => {
  {
    const t = harness();
    await t.fetchFX(false);
    assert.equal(t.calls, 1);
    assert.equal(t.$('fxMode').textContent, '自動取得成功');
    assert.match(t.$('fxNext').textContent, /提供元の予定/);
    assert.match(t.$('fxAge').textContent, /約9時間前/);
    assert.match(t.$('fxStatus').textContent, /153\.241/);
    assert.equal(JSON.parse(t.data.get('export-scout-fx-usdjpy-v1')).rate, 153.241);
  }
  {
    const t = harness({cached:cached()});
    await t.fetchFX(false);
    assert.equal(t.calls, 0, 'Do not refetch an unchanged daily rate');
    assert.match(t.$('fxMode').textContent, /前回の自動取得値/);
    assert.match(t.$('fxAge').textContent, /約9時間前/);
  }
  {
    const t = harness({cached:cached()});
    await t.fetchFX(true);
    assert.equal(t.calls, 1, 'Refresh button can force a new check');
  }
  {
    const t = harness({cached:cached(), fetcher:async()=>{throw Error('offline')}});
    await t.fetchFX(true);
    assert.match(t.$('fxMode').textContent, /自動取得失敗/);
    assert.match(t.$('fxFreshness').textContent, /最新とは限りません/);
  }
  {
    let resolveFetch;
    const t = harness({fetcher:()=>new Promise(resolve => {resolveFetch=resolve})});
    const pending = t.fetchFX(true);
    t.$('usdRate').value = '161';
    t.listeners['usdRate:input']();
    resolveFetch({ok:true, async json(){return sample()}});
    await pending;
    assert.equal(t.$('usdRate').value, '161', 'Manual input must not be overwritten by a pending request');
    assert.equal(t.$('fxMode').textContent, '手入力');
  }
  console.log('FX UI behavior tests: PASS (daily cache, forced refresh, fallback, manual race, timestamps)');
})().catch(e => {console.error(e); process.exitCode=1});
